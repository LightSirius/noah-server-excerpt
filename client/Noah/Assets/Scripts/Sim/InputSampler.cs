// Phase 6 InputSampler.
//
// architecture.md §8.1: FixedUpdate 20Hz(Time.fixedDeltaTime 0.05 — 서버 tick과 동기)로 Input.GetKey 샘플링 (holdable).
// 본 컴포넌트는 dx,dy in {-1,0,1}만 결정. 정규화·캡 적용은 서버와 ClientPrediction이 동일 로직.
// Phase E-2: Update에서 RMB 클릭 감지 → 월드좌표 변환 → OnMoveTo 이벤트(1회).

using System;
using MMORPG.Net.Generated;
using UnityEngine;

namespace MMORPG.Sim
{
    public struct InputCmd
    {
        public int Seq;
        public int Tick;
        public int Dx;
        public int Dy;
        public int Action;
        /// <summary>이 입력을 쓸 때의 이동 빠르기 — 예측과 서버가 같은 입력에서 같은 속도를 쓴다. 기본값 = 달리기.</summary>
        public MoveGait Gait;
    }

    public struct MoveToCmd
    {
        public int Seq;
        public int Tick;
        public float X;
        public float Y;
        /// <summary>우클릭 누르고 있기 이동이 다시 보낸 목적지(HoldMove) — 클릭 마커를 찍지 않고, 갈 수 없는 곳이면 보내지 않는다.</summary>
        public bool Hold;
    }

    /// <summary>이동동기화 후속 ③: 즉시 정지 의도 — 목적지 없는 MOVE_STOP 와이어와 페어.</summary>
    public struct MoveStopCmd
    {
        public int Seq;
        public int Tick;
    }

    [DisallowMultipleComponent]
    public class InputSampler : MonoBehaviour
    {
        [SerializeField] private bool _inputEnabled = true;
        [SerializeField] private Camera _camera;

        public event Action<InputCmd> OnSample;
        public event Action<MoveToCmd> OnMoveTo;
        public event Action<MoveStopCmd> OnMoveStop;

        // static인 이유: 존 전환·재접속마다 PlayerActor와 함께 새로 만들어지는데 seq는 이어 세야 한다. 서버 새 존 큐는 0부터 시작해 전환 직후
        // 도착한 옛 입력의 seq로 뛰므로, 1부터 다시 세면 그 값까지 전부 stale로 버려진다(protocol.md §3.3 INPUT_CMD).
        private static int _seq;
        private int _tickEstimate;

        public int LastSeq => _seq;

        /// <summary>시험용 키보드 이동 축(null = Input.GetKey) — 구 Input Manager는 키 입력을 합성할 수 없다.</summary>
        public static Func<Vector2Int> MoveAxisForTests { get; set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            _seq = 0;
            MoveAxisForTests = null;
        }

        /// <summary>채팅 입력처럼 키보드를 다른 UI가 점유할 때 false로 둔다. WASD/RMB 모두 차단.</summary>
        public bool Enabled { get => _inputEnabled && !MMORPG.UI.UiV3.IsTyping; set => _inputEnabled = value; }

        /// <summary>서버 ENTER_WORLD_OK.tickIndex로 클라가 자기 추정 tick 동기화.</summary>
        public void SyncTick(int serverTick) => _tickEstimate = serverTick;

        /// <summary>
        /// Phase G-4-7: 외부(CombatController 접근 이동)가 RMB와 동일한 MOVE_TO 경로를 트리거.
        /// seq를 InputSampler 단일 소스로 유지 → ClientPrediction/Reconciler 재조정 계약 동일.
        /// hold = 우클릭 누르고 있기 이동의 재송신(MoveToCmd.Hold).
        /// </summary>
        public void EmitMoveTo(Vector2 world, bool hold = false)
        {
            OnMoveTo?.Invoke(new MoveToCmd
            {
                Seq = ++_seq,
                Tick = _tickEstimate,
                X = world.x,
                Y = world.y,
                Hold = hold,
            });
        }

        /// <summary>
        /// 이동동기화 후속 ③: 즉시 정지. 종전 EmitMoveTo(예측 위치) 방식은 예측 선행분만큼
        /// 서버가 더 걷는 오버슈트를 만들었다 — 정지는 목적지가 아니라 의도이므로 전용 경로.
        /// </summary>
        public void EmitMoveStop()
        {
            OnMoveStop?.Invoke(new MoveStopCmd
            {
                Seq = ++_seq,
                Tick = _tickEstimate,
            });
        }

        private void Awake()
        {
            if (_camera == null) _camera = Camera.main;
        }

        private void Update()
        {
            if (!_inputEnabled) return;
            if (_camera == null) _camera = Camera.main;
            if (MMORPG.UI.UiInputGate.HotkeyDown(KeyCode.R, this)) LocalMoveGait.Toggle();
            // G-6-3: 우클릭 처리는 CombatController로 일원화(몬스터=상세정보 / 빈 곳=이동).
            // 이동 트리거는 CombatController가 EmitMoveTo(world)로 호출한다.
        }

        private void FixedUpdate()
        {
            if (!_inputEnabled) return;

            var axis = MoveAxisForTests != null ? MoveAxisForTests() : KeyboardAxis();
            int dx = axis.x, dy = axis.y;
            if (MMORPG.UI.UiV3.IsTyping) { dx = 0; dy = 0; } // inventory search owns keyboard; keep tick/sequence advancing.

            var cmd = new InputCmd
            {
                Seq    = ++_seq,
                Tick   = _tickEstimate++,
                Dx     = dx,
                Dy     = dy,
                Action = 0,
                Gait   = LocalMoveGait.Current,
            };
            OnSample?.Invoke(cmd);
        }

        private static Vector2Int KeyboardAxis()
        {
            int dx = 0, dy = 0;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))    dy =  1;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))  dy = -1;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))  dx = -1;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) dx =  1;
            return new Vector2Int(dx, dy);
        }
    }
}
