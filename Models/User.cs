namespace Timesheet.Models;

public class User
{
    public int Id { get; set; }
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }

    /// <summary>IANA zone used to tell which day an entry belongs to, e.g. in MCP summaries.</summary>
    public string TimeZone { get; set; } = "Europe/Stockholm";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAt { get; set; }

    public DateTime? EmailVerifiedAt { get; set; }
    public string? EmailVerificationToken { get; set; }
    public DateTime? EmailVerificationTokenExpiry { get; set; }

    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }
}
