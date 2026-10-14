import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { type Locale, titleForLocale } from "@/lib/I18nContext";

/** Return calendar date and time parts for a timestamp in the selected time zone. */
export function getTimeZoneDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour") || "0"),
    minute: Number(value("minute") || "0"),
    second: Number(value("second") || "0"),
  };
}

/** Return calendar date parts for a timestamp in the selected time zone. */
export function getTimeZoneDateParts(date: Date, timeZone: string) {
  const parts = getTimeZoneDateTimeParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

/** Calculate the UTC offset for a timestamp in the selected time zone. */
export function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const asUtc = Date.UTC(
    Number(value("year")),
    Number(value("month")) - 1,
    Number(value("day")),
    Number(value("hour")),
    Number(value("minute")),
    Number(value("second")),
  );
  return asUtc - date.getTime();
}

/** Create a timestamp for local date-time fields in the selected time zone. */
export function getTimeInZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
) {
  const utcGuess = new Date(
    Date.UTC(year, month, day, hour, minute, second, millisecond),
  );
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

export type GatewayExpiresState = {
  expiresOn?: Date;
  expiresTime: string;
};

/** Parse an API expiry timestamp into date and time state in the selected time zone. */
export function parseGatewayExpiresAt(
  value: string | null | undefined,
  timeZone: string,
): GatewayExpiresState {
  if (!value) {
    return { expiresOn: undefined, expiresTime: "23:59:59" };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { expiresOn: undefined, expiresTime: "23:59:59" };
  }
  const parts = getTimeZoneDateTimeParts(date, timeZone);
  if (!parts.year || !parts.month || !parts.day) {
    return { expiresOn: undefined, expiresTime: "23:59:59" };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
  return {
    expiresOn: new Date(parts.year, parts.month - 1, parts.day),
    expiresTime: timeStr,
  };
}

/** Format an expiry date and time string into an ISO string in the selected time zone, accurate to seconds. */
export function formatExpiresAt(
  date: Date | undefined,
  time: string | undefined,
  timeZone: string,
) {
  if (!date) {
    return null;
  }
  let hour = 23;
  let minute = 59;
  let second = 59;
  if (time && time.trim()) {
    const timeParts = time.trim().split(":").map(Number);
    if (!Number.isNaN(timeParts[0])) hour = Math.min(Math.max(timeParts[0], 0), 23);
    if (timeParts.length > 1 && !Number.isNaN(timeParts[1]))
      minute = Math.min(Math.max(timeParts[1], 0), 59);
    if (timeParts.length > 2 && !Number.isNaN(timeParts[2]))
      second = Math.min(Math.max(timeParts[2], 0), 59);
    else if (timeParts.length === 2)
      second = 0;
  }
  const nextDate = getTimeInZone(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    second,
    0,
    timeZone,
  );
  if (Number.isNaN(nextDate.getTime())) {
    return null;
  }
  return nextDate.toISOString();
}

/** Format an optional timestamp with seconds for the selected locale and time zone. */
export function formatDateTimeWithSeconds(
  locale: Locale,
  value: string | null | undefined,
  timeZone: string,
) {
  if (!value) {
    return titleForLocale(locale, "未设置", "Not set");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  });
}

/** Format an optional timestamp for the selected locale and time zone. */
export function formatDateTime(
  locale: Locale,
  value: string | null | undefined,
  timeZone: string,
) {
  if (!value) {
    return titleForLocale(locale, "未设置", "Not set");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** Format an optional date for the selected locale and time zone. */
export function formatDateOnly(
  locale: Locale,
  value: string | null | undefined,
  timeZone: string,
) {
  if (!value) {
    return titleForLocale(locale, "未设置", "Not set");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
}

/** Format a date-picker value for the selected locale. */
export function formatDateLabel(locale: Locale, value?: Date) {
  if (!value) {
    return titleForLocale(locale, "选择日期", "Pick a date");
  }
  return format(value, locale === "zh-CN" ? "PPP" : "PP", {
    locale: locale === "zh-CN" ? zhCN : enUS,
  });
}
