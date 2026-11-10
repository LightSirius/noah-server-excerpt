// 접속할 서버 주소(host:port) — 사람이 입력한 문자열을 검사해 만든다. 순수 C#(씬·Unity 없음).
// 서버는 IPv4로만 듣는다(tcpServer 0.0.0.0) — IPv6 리터럴은 받지 않는다. 숫자로만 된 호스트는 점 네 개 IPv4만, 앞자리 0은
// 8진수로 읽는 파서가 있어 거부한다. 포트를 빼면 DefaultPort.

namespace MMORPG.Net
{
    public sealed class ServerEndpoint
    {
        public const int DefaultPort = 9000;
        private const int MaxHostLength = 253;
        private const int MaxLabelLength = 63;

        public string Host { get; }
        public int Port { get; }

        private ServerEndpoint(string host, int port)
        {
            Host = host;
            Port = port;
        }

        public static ServerEndpoint Loopback(int port = DefaultPort) => new ServerEndpoint("127.0.0.1", port);

        public override string ToString() => $"{Host}:{Port}";

        /// <summary>"host" 또는 "host:port". 실패하면 사람이 읽을 사유를 error에 담는다.</summary>
        public static bool TryParse(string text, out ServerEndpoint endpoint, out string error)
        {
            endpoint = null;
            string s = text?.Trim() ?? "";
            if (s.Length == 0) return Fail("서버 주소를 입력해주세요.", out error);
            if (s.Contains("://") || s.IndexOf('/') >= 0) return Fail("주소에는 호스트와 포트만 적어주세요(예: 203.0.113.10:9000).", out error);
            if (s.IndexOf('[') >= 0 || s.IndexOf(':') != s.LastIndexOf(':')) return Fail("IPv6 주소는 지원하지 않습니다.", out error);
            foreach (char c in s)
                if (char.IsWhiteSpace(c)) return Fail("주소에 공백이 있습니다.", out error);

            int colon = s.IndexOf(':');
            string host = colon < 0 ? s : s.Substring(0, colon);
            int port = DefaultPort;
            if (colon >= 0 && !TryParsePort(s.Substring(colon + 1), out port)) return Fail("포트는 1~65535 사이의 숫자여야 합니다.", out error);
            if (!IsValidHost(host)) return Fail("서버 주소 형식이 올바르지 않습니다.", out error);

            endpoint = new ServerEndpoint(host, port);
            error = null;
            return true;
        }

        private static bool Fail(string reason, out string error)
        {
            error = reason;
            return false;
        }

        private static bool TryParsePort(string text, out int port)
        {
            port = 0;
            if (text.Length == 0 || text.Length > 5) return false;
            foreach (char c in text)
            {
                if (c < '0' || c > '9') return false;
                port = port * 10 + (c - '0');
            }
            return port >= 1 && port <= 65535;
        }

        private static bool IsValidHost(string host)
        {
            if (host.Length == 0 || host.Length > MaxHostLength) return false;
            string[] labels = host.Split('.');
            bool allNumeric = true;
            foreach (string label in labels)
            {
                if (!IsValidLabel(label)) return false;
                if (!IsDigits(label)) allNumeric = false;
            }
            return !allNumeric || IsIpv4(labels);
        }

        private static bool IsValidLabel(string label)
        {
            if (label.Length == 0 || label.Length > MaxLabelLength) return false;
            if (label[0] == '-' || label[label.Length - 1] == '-') return false;
            foreach (char c in label)
            {
                bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-';
                if (!ok) return false;
            }
            return true;
        }

        private static bool IsIpv4(string[] labels)
        {
            if (labels.Length != 4) return false;
            foreach (string octet in labels)
            {
                if (octet.Length > 3 || (octet.Length > 1 && octet[0] == '0')) return false;
                if (int.Parse(octet, System.Globalization.CultureInfo.InvariantCulture) > 255) return false;
            }
            return true;
        }

        private static bool IsDigits(string s)
        {
            foreach (char c in s)
                if (c < '0' || c > '9') return false;
            return true;
        }
    }
}
