using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using MMORPG.Net;
using MMORPG.Net.Generated;
using UnityEngine;

namespace MMORPG.Network
{
    /// <summary>Disconnected 통지의 원인(LastDisconnectCause). 연결 실패는 통지 없이 ConnectAsync의 false로만 알린다.</summary>
    public enum DisconnectCause
    {
        /// <summary>서버가 연결을 닫았다(EOF).</summary>
        RemoteClosed,
        /// <summary>수신·송신 소켓 오류(RST 등).</summary>
        Error,
        /// <summary>PongTimeoutSec 동안 PONG이 없어 클라가 스스로 끊었다.</summary>
        PongTimeout,
    }

    // 순수 전송 계층 — 재접속 정책·씬·LoginContext는 여기 두지 않는다(상위 감독자 몫).
    public class NetworkManager : MonoBehaviour
    {
        public static NetworkManager Instance { get; private set; }

        public const int DefaultConnectTimeoutMs = 5000;

        // 프레임당 PONG 나이 가산 상한의 최솟값 — PING 주기를 0에 가깝게 잡아도 감시가 멎지 않게.
        private const float MinFrameCreditSec = 0.1f;

        [SerializeField] private string _host = "127.0.0.1";
        [SerializeField] private int    _port = 9000;
        [SerializeField] private float  _pingIntervalSec = 1.0f;

        private Link _link;
        private CancellationTokenSource _connectAbort;
        private int _generation;
        private Func<ushort, bool> _sendFilter;
        // 마지막으로 버린 connect 작업의 실패 관찰자 — 시험이 직접 확인한다(Mono의 보수적 GC에선
        // UnobservedTaskException 부재로 관찰 유무를 가릴 수 없다 — 관찰 제거 뮤테이션도 통과했다).
        private Task _abandonedConnectObserver;

        // Phase D step 1: queue/handler가 byte[] body — 본문 디코드(생성 바이너리 코덱)는 PacketBus 위에서.
        // 수신 프레임·단절은 연결 세대 태그를 달고 들어온다 — 메인 스레드가 현 세대가 아닌 것을 버린다.
        private readonly ConcurrentQueue<(int gen, ushort id, byte[] body)> _queue = new();
        private readonly ConcurrentQueue<(int gen, DisconnectCause cause)> _disconnects = new();

        /// <summary>현 연결의 단절(EOF·소켓 오류·PONG 감시). 원인은 LastDisconnectCause. Disconnect()·ConnectAsync()의 해체는 통지하지 않는다.</summary>
        public event Action Disconnected;

        /// <summary>마지막 Disconnected 통지의 원인 — 핸들러 안에서 읽는다.</summary>
        public DisconnectCause LastDisconnectCause { get; private set; }

        /// <summary>
        /// 마지막 Disconnected 통지로 끊긴 연결의 세대 — 핸들러 안에서 읽는다. 통지 시점의 ConnectionGeneration은 해체로 이미 올라 있어
        /// (앞선 구독자가 다시 연결했다면 더 올라 있어) "지금 연결에서 일어난 일인가"는 이 값으로 가린다.
        /// </summary>
        public int LastDisconnectGeneration { get; private set; }

        private int _shopRequestId;
        public int NextShopRequestId() => ++_shopRequestId;
        // 서버 PlayerSession.lastStatRequestId와 같은 수명(연결) — 씬이 바뀌어도 이어져야 같은 연결에서 DUPLICATE가 되지 않는다.
        private int _statRequestId;
        public int NextStatRequestId() => ++_statRequestId;
        // 서버 PlayerSession.lastCraftRequestId와 같은 수명(연결) — 재접속 뒤 미응답 요청을 다시 보내지 않는다(protocol.md §2.16).
        private int _craftRequestId;
        public int NextCraftRequestId() => ++_craftRequestId;
        // 다중 핸들러: 같은 packetId에 raw 구독자(예: PONG no-op + PacketBus fan-out) 공존.
        private readonly Dictionary<ushort, List<Action<byte[]>>> _handlers = new();

        // Phase E-3: RTT 측정. PING의 clientTimeMs(f64 epoch ms — 이진 전환 B2a)를 PONG echo로 받아 차이 계산.
        public int RttMs { get; private set; } = -1;
        private float _pingTimer;
        private float _pongAgeSec;

        /// <summary>
        /// 연결 세대 — ConnectAsync 시작과 모든 해체(Disconnect·단절·PONG 감시)마다 1 오른다. 연결 성공은 올리지 않는다.
        /// 상위 계층이 "지금 연결에서 일어난 일인가"를 가리는 기준.
        /// </summary>
        public int ConnectionGeneration => Volatile.Read(ref _generation);

        /// <summary>연결이 수립돼 송수신 루프가 도는 중.</summary>
        public bool IsConnected => _link != null;

        /// <summary>
        /// PONG 감시 임계(초, 0 이하 = 끔 — 기본). 연결 중 PONG 나이가 이를 넘으면 해체하고 Disconnected(PongTimeout)를 통지한다.
        /// 연결이 바뀌어도 유지된다. 송신 필터가 PING을 막으면 무응답으로 센다.
        /// </summary>
        public float PongTimeoutSec { get; set; }

        /// <summary>
        /// 연결 시점과 마지막 PONG 중 늦은 쪽부터 센 PONG 나이(초, 미연결 = -1). 감시가 꺼져 있어도 센다("연결 불안정" 표시용).
        /// 프레임 하나는 PING 주기까지만 보탠다 — 메인 스레드 정지(로딩·에디터 일시정지) 동안은 PING도 못 보냈으니 무응답의 증거가 아니다.
        /// </summary>
        public float SecondsSinceLastPong => _link == null ? -1f : _pongAgeSec;

        /// <summary>송신 필터가 버린 송신 누계(진단·시험용).</summary>
        public int FilteredSendCount { get; private set; }

        /// <summary>다음 ConnectAsync가 접속할 주소. 자동 재접속도 같은 주소로 붙는다.</summary>
        public string Host => _host;
        public int Port => _port;

        /// <summary>씬에 직렬화된 기본 주소 — 사용자가 주소를 비워 두면 여기로 붙는다.</summary>
        public ServerEndpoint DefaultEndpoint { get; private set; }

        /// <summary>다음 ConnectAsync부터 쓸 주소. 지금 연결은 건드리지 않는다(ConnectAsync가 옛 연결을 해체하고 붙는다).</summary>
        public void SetEndpoint(ServerEndpoint endpoint)
        {
            if (endpoint == null) throw new ArgumentNullException(nameof(endpoint));
            _host = endpoint.Host;
            _port = endpoint.Port;
        }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            DefaultEndpoint = ServerEndpoint.TryParse($"{_host}:{_port}", out var serialized, out _) ? serialized : ServerEndpoint.Loopback();
            // PONG: 아무도 PacketBus.Subscribe<PongPayload>를 안 해도 RTT 측정은 동작해야 함.
            // raw 핸들러로 no-op 등록 → "Unhandled packet" 경고 방지.
            Register(PacketIds.PONG, _ => { });
            // 씬 재로드 시 PacketBus._subs는 살아있지만 _handlers는 비어있을 수 있다.
            // 현재 살아있는 구독에 대해 fan-out을 다시 바인딩.
            PacketBus.ReBindAll(this);
        }

        private void Update()
        {
            DispatchFrames();
            // 수신 패킷(KICK 포함)을 먼저 처리한 뒤 메인 스레드에서 단절 통지.
            DispatchDisconnects();
            TickPongWatchdog();
            TickPing();
        }

        private void DispatchFrames()
        {
            while (_queue.TryDequeue(out var packet))
            {
                // 이전 세대(재연결·해체 전) 프레임은 새 연결의 구독자에게 닿으면 안 된다 — 핸들러가 도중에 끊어도 같다.
                if (packet.gen != ConnectionGeneration) continue;
                // Phase E-3: PONG은 생존·RTT만 가로채고, 실제 dispatch는 PacketBus가 처리.
                if (packet.id == PacketIds.PONG) OnPong(packet.body);
                Dispatch(packet.id, packet.body);
            }
        }

        private void Dispatch(ushort packetId, byte[] body)
        {
            if (!_handlers.TryGetValue(packetId, out var list) || list.Count == 0)
            {
                Debug.LogWarning($"[Net] Unhandled packet 0x{packetId:X4}");
                return;
            }
            // 사본 순회 — 핸들러 내부에서 Register/Unregister가 일어나도 안전.
            foreach (var handler in list.ToArray())
            {
                try { handler(body); }
                catch (Exception e) { Debug.LogError($"[Net] handler 0x{packetId:X4}: {e.Message}"); }
            }
        }

        private void DispatchDisconnects()
        {
            while (_disconnects.TryDequeue(out var lost))
            {
                if (lost.gen != ConnectionGeneration || _link == null) continue;
                RaiseDisconnected(lost.gen, lost.cause);
            }
        }

        private void RaiseDisconnected(int lostGeneration, DisconnectCause cause)
        {
            TeardownConnection();
            LastDisconnectGeneration = lostGeneration;
            LastDisconnectCause = cause;
            Disconnected?.Invoke();
        }

        private void TickPongWatchdog()
        {
            if (_link == null) return;
            _pongAgeSec += Mathf.Min(Time.unscaledDeltaTime, Mathf.Max(_pingIntervalSec, MinFrameCreditSec));
            if (PongTimeoutSec <= 0f || _pongAgeSec < PongTimeoutSec) return;
            Debug.LogWarning($"[Net] No PONG for {_pongAgeSec:F1}s — closing the connection");
            RaiseDisconnected(_link.Generation, DisconnectCause.PongTimeout);
        }

        // Phase E-3: 자동 PING 송신.
        private void TickPing()
        {
            if (_link == null || !_link.Client.Connected) return;
            _pingTimer += Time.unscaledDeltaTime;
            if (_pingTimer < _pingIntervalSec) return;
            _pingTimer = 0f;
            SendPing();
        }

        private void SendPing()
        {
            try
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                Send(PacketIds.PING, new PingPayload { ClientTimeMs = now });
            }
            catch { /* connection dropped */ }
        }

        // 현 세대 PONG은 본문 디코드 성공 여부와 무관하게 생존 증거다.
        private void OnPong(byte[] body)
        {
            _pongAgeSec = 0f;
            UpdateRttFromPong(body);
        }

        // 이진 전환 B3b: PONG 본문은 바이너리(f64 × 2) — 생성 디코더로 읽는다(실패 = 사유가 있는 null, 예외 없음).
        // 디코더가 NaN·±Inf를 거부하므로 0(미설정) 이하만 거른다. 구독자 디스패치(PacketBus)는 따로 같은 디코더를 쓴다.
        private void UpdateRttFromPong(byte[] body)
        {
            var pong = WireCodec.DecodePong(body, out _);
            if (pong == null || !(pong.ClientTimeMs > 0)) return;
            double rtt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - pong.ClientTimeMs;
            if (rtt >= 0 && rtt < int.MaxValue) RttMs = (int)rtt;
        }

        private void OnDestroy() => Disconnect();

        public void Register(ushort packetId, Action<byte[]> handler)
        {
            if (handler == null) return;
            if (!_handlers.TryGetValue(packetId, out var list))
            {
                list = new List<Action<byte[]>>();
                _handlers[packetId] = list;
            }
            list.Add(handler);
        }

        /// <summary>해당 packetId의 모든 핸들러를 제거.</summary>
        public void Unregister(ushort packetId) => _handlers.Remove(packetId);

        /// <summary>
        /// 송신 허용 판정(null = 전부 허용 — 기본). 거부된 송신은 조용히 버리고 FilteredSendCount에 센다.
        /// 내부 1 Hz PING도 같은 판정을 거친다. 연결이 바뀌어도 유지되며 null로 해제한다.
        /// </summary>
        public void SetSendFilter(Func<ushort, bool> allow) => _sendFilter = allow;

        /// <summary>
        /// 이전 연결을 해체(세대 +1)하고 _host:_port에 연결한다. timeoutMs 안에 수립되지 않으면 false(0 이하 = OS 기본 대기). 던지지 않는다.
        /// 대기 중 Disconnect()나 다른 ConnectAsync가 끼어들면 로그 없이 false — 그 시도는 아무 상태도 남기지 않고,
        /// 호출자는 끼어든 호출 밖(다음 프레임)에서 재개한다.
        /// </summary>
        public async Task<bool> ConnectAsync(int timeoutMs = DefaultConnectTimeoutMs)
        {
            // 재연결 안전(리뷰 #11): 이전 연결의 루프/큐를 먼저 완전히 정리한다. 세대는 이 해체가 올린 값 그대로 —
            // 해체 도중 다른 ConnectAsync가 끼어들었다면 이 시도는 이미 대체됐다(두 시도가 한 세대를 나누면 연결이 둘 남는다).
            int gen = TeardownConnection();
            if (gen != ConnectionGeneration) return false;
            var abort = new CancellationTokenSource();
            _connectAbort = abort;
            TcpClient client = null;
            try
            {
                // 이동동기화 ③: Nagle 비활성 — INPUT_CMD(20Hz 소패킷)가 지연ACK과 맞물려
                // 수십 ms 밀리면 재조정 미ack 창이 커져 방향 전환 체감 오차가 증폭된다.
                // 시도마다 지역 TcpClient — 필드는 세대 확인을 통과한 뒤에만 게시한다(끼어든 호출과의 교차 오염 차단).
                client = new TcpClient { NoDelay = true };
                bool connected = await ConnectWithinAsync(client, _host, _port, timeoutMs, abort.Token);
                if (gen != ConnectionGeneration)
                {
                    client.Close();
                    // 대체는 해체의 Cancel 안에서 동기로 이어 실행된다 — 호출자가 해체 도중에 재개하지 않게 한 번 양보한다.
                    await Task.Yield();
                    return false;
                }
                if (!connected)
                {
                    client.Close();
                    Debug.LogWarning($"[Net] Connect timed out after {timeoutMs} ms: {_host}:{_port}");
                    return false;
                }
                StartLink(new Link(gen, client));
                Debug.Log($"[Net] Connected to {_host}:{_port}");
                return true;
            }
            catch (Exception e)
            {
                client?.Close();
                // 네트워크 실패는 환경 문제라 경고, 대체된 시도의 실패는 무음.
                if (gen == ConnectionGeneration) Debug.LogWarning($"[Net] Connect failed: {e.Message}");
                return false;
            }
            finally
            {
                if (_connectAbort == abort) _connectAbort = null;
                // 대기 타이머 해제. Dispose는 하지 않는다 — 해체가 같은 원본을 쥐고 Cancel할 수 있다(타이머 없는 원본이라 GC로 충분).
                abort.Cancel();
            }
        }

        // 수립 = true, 시간 초과·중단 = false, 연결 실패 = 예외. 버린 connect 작업의 늦은 실패는 관찰 처리(UnobservedTaskException 방지).
        private async Task<bool> ConnectWithinAsync(TcpClient client, string host, int port, int timeoutMs, CancellationToken abort)
        {
            Task connect = client.ConnectAsync(host, port);
            Task wait = Task.Delay(timeoutMs > 0 ? timeoutMs : Timeout.Infinite, abort);
            if (await Task.WhenAny(connect, wait) != connect)
            {
                _abandonedConnectObserver = connect.ContinueWith(t => _ = t.Exception, CancellationToken.None,
                    TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
                return false;
            }
            await connect;
            return true;
        }

        private void StartLink(Link link)
        {
            // 세대 확인을 통과하는 시도는 세대마다 하나이고 해체가 늘 _link를 비운다 — 남아 있다면 버그다(닫아서 고아 소켓을 막는다).
            if (_link != null)
            {
                Debug.LogError($"[Net] StartLink over a live link (gen {_link.Generation} -> {link.Generation})");
                _link.Close();
            }
            _link = link;
            _pingTimer = 0f;
            _pongAgeSec = 0f;
            _ = Task.Run(() => SendLoopAsync(link));
            _ = ReceiveLoopAsync(link, new PacketReader());
        }

        public void Disconnect() => TeardownConnection();

        /// <summary>
        /// 연결 상태 전체 해체(리뷰 #11) + 세대 +1 — 올린 세대를 돌려준다. 블로킹 대기 없음(Unity 메인스레드 안전) — 구 루프는 취소 토큰과
        /// 스트림 Close로 자연 종료된다. 대기 중인 connect도 중단한다. 늦게 도착하는 구 루프의 프레임·단절은 세대 태그로 버려진다.
        /// </summary>
        private int TeardownConnection()
        {
            // 세대가 먼저 — 아래 Cancel의 콜백에서 이어 실행되는 ConnectAsync가 이미 대체됐음을 보게 한다.
            int gen = Interlocked.Increment(ref _generation);
            var abort = _connectAbort;
            _connectAbort = null;
            _link?.Close();
            _link = null;

            while (_queue.TryDequeue(out _)) { }
            while (_disconnects.TryDequeue(out _)) { }

            RttMs       = -1;
            _pingTimer  = 0f;
            _pongAgeSec = 0f;
            _shopRequestId = 0;
            _statRequestId = 0;
            _craftRequestId = 0;
            // 대기 중 connect 중단은 마지막 — Cancel이 그 시도의 이어 실행을 동기로 부르므로 그때 해체가 끝나 있어야 한다.
            try { abort?.Cancel(); } catch (ObjectDisposedException) { /* ignore */ }
            return gen;
        }

        public void Send<T>(ushort packetId, T payload) where T : class
        {
            var link = _link;
            // 연결 전이면 큐잉도 스킵 (무한증가 방지).
            if (link == null || !link.Client.Connected) return;
            if (!PassesSendFilter(packetId)) { FilteredSendCount++; return; }
            try
            {
                link.SendQueue.Enqueue(PacketWriter.Build(packetId, payload));
                link.SendSignal.Release();
            }
            catch (Exception e)
            {
                Debug.LogError($"[Net] Send build error: {e.Message}");
            }
        }

        private bool PassesSendFilter(ushort packetId)
        {
            var filter = _sendFilter;
            if (filter == null) return true;
            try { return filter(packetId); }
            catch (Exception e)
            {
                // 필터 결함은 진짜 버그 — 그 송신만 버리고 호출자(게임 코드·내부 PING)로 예외를 퍼뜨리지 않는다.
                Debug.LogError($"[Net] Send filter error 0x{packetId:X4}: {e.Message}");
                return false;
            }
        }

        // 루프는 자기 Link만 만진다(리뷰 #11) — 필드를 다시 읽지 않아 구 루프가 새 연결의 스트림·송신 큐를 건드릴 수 없다.
        private async Task SendLoopAsync(Link link)
        {
            var ct = link.Token;
            while (!ct.IsCancellationRequested)
            {
                try { await link.SendSignal.WaitAsync(ct); }
                catch (OperationCanceledException) { return; }
                catch (ObjectDisposedException) { return; } // teardown이 semaphore를 먼저 Dispose한 경우

                // signal 1회당 가능한 한 모두 drain. 남은 큐는 Link와 함께 버려진다.
                while (!ct.IsCancellationRequested && link.SendQueue.TryDequeue(out var data))
                {
                    try { await link.Stream.WriteAsync(data, 0, data.Length, ct); }
                    catch (OperationCanceledException) { return; }
                    catch (Exception e)
                    {
                        if (ct.IsCancellationRequested) return;
                        Debug.LogWarning($"[Net] Send error: {e.Message}");
                        _disconnects.Enqueue((link.Generation, DisconnectCause.Error));
                        return;
                    }
                }
            }
        }

        private async Task ReceiveLoopAsync(Link link, PacketReader reader)
        {
            var ct = link.Token;
            var cause = DisconnectCause.RemoteClosed;
            byte[] buf = new byte[4096];
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    int read = await link.Stream.ReadAsync(buf, 0, buf.Length, ct);
                    if (read == 0) break;

                    reader.Append(buf, read);
                    while (reader.TryRead(out var id, out var body))
                        _queue.Enqueue((link.Generation, id, body));
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e)
            {
                cause = DisconnectCause.Error;
                // 의도적 teardown(Close)으로 인한 예외는 정상 종료 — 로그 없음.
                if (!ct.IsCancellationRequested) Debug.LogWarning($"[Net] Receive error: {e.Message}");
            }

            if (ct.IsCancellationRequested) return;
            Debug.Log("[Net] Disconnected");
            _disconnects.Enqueue((link.Generation, cause));
        }

        // 연결 하나의 소켓·루프 자원. 프레이밍 파서는 수신 루프의 지역 객체라 해체 때 함께 버려진다.
        private sealed class Link
        {
            public readonly int Generation;
            public readonly TcpClient Client;
            public readonly NetworkStream Stream;
            public readonly CancellationToken Token;
            public readonly SemaphoreSlim SendSignal = new(0);
            public readonly ConcurrentQueue<byte[]> SendQueue = new();
            private readonly CancellationTokenSource _cts = new();

            public Link(int generation, TcpClient client)
            {
                Generation = generation;
                Client = client;
                Stream = client.GetStream();
                Token = _cts.Token;
            }

            public void Close()
            {
                try { _cts.Cancel(); } catch { /* ignore */ }
                try { SendSignal.Release(); } catch { /* ignore */ }
                try { Stream.Close(); } catch { /* ignore */ }
                try { Client.Close(); } catch { /* ignore */ }
                try { _cts.Dispose(); } catch { /* ignore */ }
                try { SendSignal.Dispose(); } catch { /* ignore */ }
            }
        }
    }
}
