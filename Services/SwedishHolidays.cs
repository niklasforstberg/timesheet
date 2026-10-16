namespace Timesheet.Services;

// Swedish public holidays ("röda dagar") plus midsommarafton, julafton and
// nyårsafton, which are days off in practice. Computed, so every year works.
public static class SwedishHolidays
{
    public static IReadOnlyDictionary<DateOnly, string> For(int year)
    {
        var easter = EasterSunday(year);
        var midsummer = FirstSaturdayFrom(new DateOnly(year, 6, 20));
        return new Dictionary<DateOnly, string>
        {
            [new DateOnly(year, 1, 1)] = "Nyårsdagen",
            [new DateOnly(year, 1, 6)] = "Trettondedag jul",
            [easter.AddDays(-2)] = "Långfredagen",
            [easter] = "Påskdagen",
            [easter.AddDays(1)] = "Annandag påsk",
            [new DateOnly(year, 5, 1)] = "Första maj",
            [easter.AddDays(39)] = "Kristi himmelsfärdsdag",
            [easter.AddDays(49)] = "Pingstdagen",
            [new DateOnly(year, 6, 6)] = "Nationaldagen",
            [midsummer.AddDays(-1)] = "Midsommarafton",
            [midsummer] = "Midsommardagen",
            [FirstSaturdayFrom(new DateOnly(year, 10, 31))] = "Alla helgons dag",
            [new DateOnly(year, 12, 24)] = "Julafton",
            [new DateOnly(year, 12, 25)] = "Juldagen",
            [new DateOnly(year, 12, 26)] = "Annandag jul",
            [new DateOnly(year, 12, 31)] = "Nyårsafton",
        };
    }

    public static string? Name(DateOnly day) => For(day.Year).GetValueOrDefault(day);

    private static DateOnly FirstSaturdayFrom(DateOnly d) => d.AddDays(((int)DayOfWeek.Saturday - (int)d.DayOfWeek + 7) % 7);

    // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
    private static DateOnly EasterSunday(int y)
    {
        int a = y % 19, b = y / 100, c = y % 100, d = b / 4, e = b % 4;
        int f = (b + 8) / 25, g = (b - f + 1) / 3, h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31, day = (h + l - 7 * m + 114) % 31 + 1;
        return new DateOnly(y, month, day);
    }
}
