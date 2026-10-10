namespace Timesheet.Models;

public class Tag
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public required string Name { get; set; }
    public bool Archived { get; set; }

    public string? ClockifyId { get; set; }

    public List<TimeEntry> TimeEntries { get; set; } = [];
}
