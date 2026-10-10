using System.Security.Cryptography;
using System.Text;

namespace Timesheet.Services;

// Generation and hashing of personal access tokens. Tokens look like
// "ts_<43 base64url chars>"; only the hash is ever persisted.
public static class ApiTokenService
{
    public const string Prefix = "ts_";

    public static string Generate() => Prefix + Base64Url(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) =>
        Base64Url(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>The leading characters shown in the UI, e.g. "ts_a1b2c3d4".</summary>
    public static string DisplayPrefix(string token) =>
        token[..Math.Min(token.Length, Prefix.Length + 8)];

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
