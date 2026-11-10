// Phase F-6 NavGridLoader (C#) — 서버 server/src/world/nav/loader.ts의 클라 사이드 미러.
//
// Resources/Maps/zone-{id}.nav.json (TextAsset) -> NavGrid 객체 캐시.
// 첫 호출 시 로드+캐시. 같은 zoneId 재호출은 즉시 반환. 실패 시 null.
// shared/maps/* 미러는 사용자가 책임 (디버그 + 클라 즉시 path 예측 전용).

using System;
using System.Collections.Generic;
using UnityEngine;

namespace MMORPG.World.Nav
{
    public static class NavGridLoader
    {
        [Serializable]
        private sealed class NavMapJson
        {
            public int zoneId;
            public int version;
            public string name;
            public float cellSize;
            public float originX;
            public float originY;
            public int width;
            public int height;
            public string[] rows;
        }

        private static readonly Dictionary<int, NavGrid> _cache = new();

        public static NavGrid GetOrLoad(int zoneId)
        {
            if (_cache.TryGetValue(zoneId, out var cached)) return cached;
            var grid = TryLoad(zoneId);
            if (grid != null) _cache[zoneId] = grid;
            return grid;
        }

        public static void ClearCache() => _cache.Clear();

        private static NavGrid TryLoad(int zoneId)
        {
            var ta = Resources.Load<TextAsset>($"Maps/zone-{zoneId}.nav");
            if (ta == null)
            {
                Debug.LogWarning($"[NavGridLoader] Resources/Maps/zone-{zoneId}.nav not found.");
                return null;
            }
            NavMapJson json;
            try { json = JsonUtility.FromJson<NavMapJson>(ta.text); }
            catch (Exception e)
            {
                Debug.LogError($"[NavGridLoader] parse failed for zone {zoneId}: {e.Message}");
                return null;
            }
            if (json == null || json.rows == null || json.width <= 0 || json.height <= 0)
            {
                Debug.LogError($"[NavGridLoader] invalid nav json for zone {zoneId}.");
                return null;
            }
            if (json.rows.Length != json.height)
            {
                Debug.LogError(
                    $"[NavGridLoader] rows.Length({json.rows.Length}) != height({json.height}).");
                return null;
            }

            var cells = new byte[json.width * json.height];
            for (int cy = 0; cy < json.height; cy++)
            {
                var row = json.rows[cy];
                for (int cx = 0; cx < json.width; cx++)
                {
                    bool blocked = cx < row.Length && row[cx] == '#';
                    cells[cy * json.width + cx] = blocked ? (byte)1 : (byte)0;
                }
            }
            return new NavGrid(json.width, json.height, json.cellSize, json.originX, json.originY, cells);
        }
    }
}
