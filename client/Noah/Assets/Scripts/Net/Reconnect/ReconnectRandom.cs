namespace MMORPG.Net
{
    /// <summary>백오프 지터 난수 — 시험은 고정·시드 값을 주입한다.</summary>
    public interface IReconnectRandom
    {
        /// <summary>[0, 1) 균등 난수.</summary>
        double NextUnit();
    }

    /// <summary>System.Random 기반 — 같은 시드면 같은 수열(시험 재현). 운영은 CreateUnpredictable을 쓴다.</summary>
    public sealed class SystemReconnectRandom : IReconnectRandom
    {
        private readonly System.Random _random;

        /// <summary>시험·재현용. 운영에서 상수·계정 id처럼 클라끼리 겹칠 수 있는 시드를 주면 재시도가 줄을 서 지터가 무력해진다.</summary>
        public SystemReconnectRandom(int seed) { _random = new System.Random(seed); }

        /// <summary>운영용 — 클라마다 다른 시드(Guid)라 같은 순간 끊긴 클라들의 재시도가 흩어진다.</summary>
        public static SystemReconnectRandom CreateUnpredictable() => new SystemReconnectRandom(System.Guid.NewGuid().GetHashCode());

        public double NextUnit() => _random.NextDouble();
    }
}
