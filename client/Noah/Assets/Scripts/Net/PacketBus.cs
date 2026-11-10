// Phase 6 PacketBus.
//
// architecture.md §8.3: v1의 Dictionary<id, Action> 덮어쓰기 폐기.
// Action<T> 멀티 구독 + Subscription token으로 명시 해제.
//
// 내부 transport는 v1 NetworkManager 그대로 사용. PacketBus는 그 위의 thin facade.
// NetworkManager가 raw byte[] body를 전달하고, PacketBus가 생성 코덱 WireCodec.Decode(규칙 shared/protocol.md §2)로 codec.Generated.cs의
// 페이로드 타입을 만든다 — 모든 패킷 본문이 바이너리다(이진 전환 B6에 JSON 분기 제거). 디코드 실패(사유 WireError — 스키마 밖 id는 사유 None)·
// 페이로드 형 불일치는 로그 후 drop.

using System;
using System.Collections.Generic;
using MMORPG.Net.Generated;
using MMORPG.Network;
using UnityEngine;

namespace MMORPG.Net
{
    public sealed class Subscription : IDisposable
    {
        private Action _onDispose;
        public Subscription(Action onDispose) { _onDispose = onDispose; }
        public void Dispose()
        {
            _onDispose?.Invoke();
            _onDispose = null;
        }
    }

    public static class PacketBus
    {
        // packetId -> 구독자 콜백 리스트. 같은 packetId에 N개 구독 가능.
        private static readonly Dictionary<ushort, List<Action<byte[]>>> _subs = new();
        // packetId -> NetworkManager에 등록한 fan-out 클로저. ReBindAll에서 재사용.
        private static readonly Dictionary<ushort, Action<byte[]>> _fanouts = new();

        /// <summary>
        /// 본문을 생성 코덱으로 디코드해 T로 콜백. 같은 packetId에 다중 구독 가능.
        /// </summary>
        public static Subscription Subscribe<T>(ushort packetId, Action<T> handler)
        {
            Action<byte[]> wrapper = (body) =>
            {
                if (!TryDecode(packetId, body, out T parsed)) return;
                handler(parsed);
            };

            if (!_subs.TryGetValue(packetId, out var list))
            {
                list = new List<Action<byte[]>>();
                _subs[packetId] = list;
                RegisterFanout(packetId);
            }
            list.Add(wrapper);

            return new Subscription(() =>
            {
                if (_subs.TryGetValue(packetId, out var l))
                {
                    l.Remove(wrapper);
                    if (l.Count == 0)
                    {
                        _subs.Remove(packetId);
                        _fanouts.Remove(packetId);
                        NetworkManager.Instance?.Unregister(packetId);
                    }
                }
            });
        }

        /// <summary>생성 코덱 디코드 + 구독 형 확인. 실패는 로그(스키마 밖 id = 디코드 사유 None)하고 false.</summary>
        private static bool TryDecode<T>(ushort packetId, byte[] body, out T parsed)
        {
            parsed = default;
            object decoded;
            WireError error;
            try
            {
                decoded = WireCodec.Decode(packetId, body, out error);
            }
            catch (Exception e)
            {
                Debug.LogError($"[PacketBus] decode 0x{packetId:X4}: {e.Message}");
                return false;
            }
            if (decoded == null)
            {
                string why = error == WireError.None ? "unknown packet (not in schema)" : error.ToString();
                Debug.LogError($"[PacketBus] decode 0x{packetId:X4}: {why}");
                return false;
            }
            if (!(decoded is T typed))
            {
                Debug.LogError($"[PacketBus] 0x{packetId:X4}: payload {decoded.GetType().Name} != subscriber {typeof(T).Name}");
                return false;
            }
            parsed = typed;
            return true;
        }

        /// <summary>
        /// NetworkManager가 씬 전환·재초기화 등으로 _handlers를 비웠을 때 호출.
        /// 현재 살아있는 모든 packetId에 대해 fan-out 핸들러를 다시 등록한다.
        /// _subs(구독자 리스트)는 static이라 보존되므로 fan-out만 재바인딩하면 됨.
        /// </summary>
        public static void ReBindAll(NetworkManager nm)
        {
            if (nm == null) return;
            foreach (var kv in _subs)
            {
                ushort id = kv.Key;
                if (!_fanouts.TryGetValue(id, out var fan))
                {
                    fan = (body) => Fanout(id, body);
                    _fanouts[id] = fan;
                }
                nm.Register(id, fan);
            }
        }

        private static void RegisterFanout(ushort packetId)
        {
            ushort id = packetId;
            if (!_fanouts.TryGetValue(id, out var fan))
            {
                fan = (body) => Fanout(id, body);
                _fanouts[id] = fan;
            }
            var nm = NetworkManager.Instance;
            if (nm != null) nm.Register(id, fan);
        }

        private static void Fanout(ushort packetId, byte[] body)
        {
            if (!_subs.TryGetValue(packetId, out var list)) return;
            // 사본 순회 — Subscribe/Dispose 가 콜백 안에서 일어나도 안전.
            var copy = list.ToArray();
            foreach (var cb in copy)
            {
                try { cb(body); }
                catch (Exception e) { Debug.LogError($"[PacketBus] handler 0x{packetId:X4}: {e}"); }
            }
        }

        public static int SubscriberCount(ushort packetId)
            => _subs.TryGetValue(packetId, out var l) ? l.Count : 0;
    }
}
