namespace Timesheet.Models;

public class Client
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public required string Name { get; set; }
    public bool Archived { get; set; }

    /// <summary>Set when imported from Clockify, so a re-import updates instead of duplicating.</summary>
    public string? ClockifyId { get; set; }

    public List<Project> Projects { get; set; } = [];
}
