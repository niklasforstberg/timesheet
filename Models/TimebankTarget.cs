namespace Timesheet.Models;

// How many minutes a project's time bank expects per week. A schedule row
// (OnlyThisWeek = false) applies from its week until the next schedule row; an
// OnlyThisWeek row replaces the schedule for that one week (vacation, sick days).
public class TimebankTarget
{
    public int Id { get; set; }
    public int ProjectId { get; set; }

    /// <summary>Monday of the week the row applies from (or to, when OnlyThisWeek).</summary>
    public DateOnly WeekStart { get; set; }
    public int Minutes { get; set; }
    public bool OnlyThisWeek { get; set; }
    public string Note { get; set; } = "";
}
