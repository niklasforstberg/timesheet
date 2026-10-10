namespace Timesheet.Models;

// A personal access token letting an MCP client read the user's data.
// Only the SHA-256 hash is stored; the plaintext is shown once at creation.
public class ApiToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>User-chosen label, e.g. "Claude Desktop".</summary>
    public required string Name { get; set; }

    /// <summary>Base64url SHA-256 of the plaintext token.</summary>
    public required string TokenHash { get; set; }

    /// <summary>First few characters of the token, so the user can tell tokens apart in the UI.</summary>
    public required string Prefix { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
}
