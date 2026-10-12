namespace Timesheet.Models;

public class Project
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int? ClientId { get; set; }
    public Client? Client { get; set; }

    public required string Name { get; set; }

    /// <summary>Hex colour, e.g. "#03A9F4".</summary>
    public string Color { get; set; } = "#03A9F4";

    /// <summary>Default for new entries on this project.</summary>
    public bool Billable { get; set; }
    public bool Archived { get; set; }

    /// <summary>Monday the time bank starts counting from; null when the project has no bank.</summary>
    public DateOnly? TimebankStart { get; set; }

    /// <summary>Balance carried into the bank at TimebankStart, in minutes (negative = owed).</summary>
    public int TimebankOpeningMinutes { get; set; }

    public string? ClockifyId { get; set; }
}
