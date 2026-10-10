namespace Timesheet.Models;

// One stretch of tracked time. An entry with End == null is the running timer;
// a user has at most one (partial unique index in ApplicationDbContext).
public class TimeEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int? ProjectId { get; set; }
    public Project? Project { get; set; }

    public string Description { get; set; } = "";
    public DateTime Start { get; set; }
    public DateTime? End { get; set; }
    public bool Billable { get; set; }

    public string? ClockifyId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<Tag> Tags { get; set; } = [];
}
