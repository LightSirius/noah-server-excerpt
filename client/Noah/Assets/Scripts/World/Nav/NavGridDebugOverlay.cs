// Phase F-8 NavGridDebugOverlay — walkable 셀 시각화 토글.
//
// 키 단축키 F2로 on/off. blocked 셀을 빨강 반투명, walkable은 투명.
// 한 zone당 Texture2D 1장에 픽셀 채색 → SpriteRenderer 1개로 렌더 (가벼움).
//
// 데이터 소스: NavGridLoader.GetOrLoad(zoneId) — 같은 JSON을 두 번 파싱하지 않도록 통합.

using UnityEngine;

namespace MMORPG.World.Nav
{
    [DisallowMultipleComponent]
    public sealed class NavGridDebugOverlay : MonoBehaviour
    {
        [SerializeField] private KeyCode _toggleKey = KeyCode.F2;
        [SerializeField] private int _zoneId = 1;

        private static readonly Color BlockedColor = new Color(1f, 0.2f, 0.2f, 0.40f);
        private static readonly Color WalkableColor = new Color(0f, 0f, 0f, 0f);

        private SpriteRenderer _renderer;
        private bool _loaded;

        private void Awake()
        {
            EnsureRenderer();
            TryLoad(_zoneId);
            SetVisible(false);
        }

        private void Update()
        {
            if (!MMORPG.UI.UiInputGate.ModalOpen && !MMORPG.UI.UiV3.IsTyping && Input.GetKeyDown(_toggleKey))
            {
                if (!_loaded)
                {
                    TryLoad(_zoneId);
                    if (!_loaded) return;
                }
                SetVisible(!_renderer.enabled);
            }
        }

        public void SetZone(int zoneId)
        {
            if (_zoneId == zoneId && _loaded) return;
            _zoneId = zoneId;
            TryLoad(zoneId);
        }

        private void EnsureRenderer()
        {
            _renderer = GetComponent<SpriteRenderer>();
            if (_renderer == null) _renderer = gameObject.AddComponent<SpriteRenderer>();
            WorldSorting.Apply(_renderer, WorldSorting.NavDebug); // 몸통(World) 아래.
        }

        private void TryLoad(int zoneId)
        {
            _loaded = false;
            var grid = NavGridLoader.GetOrLoad(zoneId);
            if (grid == null) return; // NavGridLoader 측에서 이미 LogWarning/LogError 처리.

            var sprite = BuildSprite(zoneId, grid);
            _renderer.sprite = sprite;
            transform.position = new Vector3(grid.OriginX, grid.OriginY, 0f);
            _loaded = true;
        }

        private static Sprite BuildSprite(int zoneId, NavGrid grid)
        {
            // PPU = 1/cellSize → sprite 1픽셀이 cellSize 월드 단위에 매핑.
            // pivot = (0,0) → sprite 좌하단이 OriginX,OriginY에 정렬.
            var tex = new Texture2D(grid.Width, grid.Height, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                name = $"NavGridDebug_zone{zoneId}",
            };
            // NavGrid는 row-major: cy=0이 +y 방향에서 가장 아래.
            // Texture2D.SetPixel(x,y)는 y=0이 아래쪽 → 그대로 매핑.
            var pixels = new Color[grid.Width * grid.Height];
            for (int cy = 0; cy < grid.Height; cy++)
            {
                for (int cx = 0; cx < grid.Width; cx++)
                {
                    bool blocked = grid.IsBlockedCell(cx, cy);
                    pixels[cy * grid.Width + cx] = blocked ? BlockedColor : WalkableColor;
                }
            }
            tex.SetPixels(pixels);
            tex.Apply(false, true);

            float ppu = 1f / Mathf.Max(0.0001f, grid.CellSize);
            return Sprite.Create(
                tex,
                new Rect(0, 0, grid.Width, grid.Height),
                new Vector2(0f, 0f),
                ppu);
        }

        private void SetVisible(bool on)
        {
            if (_renderer != null) _renderer.enabled = on;
        }
    }
}
