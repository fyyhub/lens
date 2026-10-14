import { enUS, zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronsUpDown, Clock } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Field, FieldLabel } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/classNames";
import { type Locale, titleForLocale } from "@/lib/I18nContext";

import {
  formatDateLabel,
  getTimeZoneDateParts,
  getTimeZoneDateTimeParts,
} from "./gatewayDateTime";

type GatewayApiKeyExpiryFieldProps = {
  locale: Locale;
  expiresOn?: Date;
  expiresTime: string;
  timeZone: string;
  onExpiresOnChange: (value?: Date) => void;
  onExpiresTimeChange: (value: string) => void;
  onClear: () => void;
};

/** Renders the time-zone-aware gateway key expiry date and time picker accurate to seconds. */
export function GatewayApiKeyExpiryField({
  locale,
  expiresOn,
  expiresTime,
  timeZone,
  onExpiresOnChange,
  onExpiresTimeChange,
  onClear,
}: GatewayApiKeyExpiryFieldProps) {
  function applyPresetDays(days: number) {
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const parts = getTimeZoneDateTimeParts(target, timeZone);
    const nextDate = new Date(parts.year, parts.month - 1, parts.day);
    const pad = (n: number) => String(n).padStart(2, "0");
    const nextTime = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
    onExpiresOnChange(nextDate);
    onExpiresTimeChange(nextTime);
  }

  function applyPresetEndOfDay() {
    const now = new Date();
    const parts = getTimeZoneDateParts(now, timeZone);
    onExpiresOnChange(new Date(parts.year, parts.month - 1, parts.day));
    onExpiresTimeChange("23:59:59");
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="gateway-key-expiry-time">
          {titleForLocale(
            locale,
            "过期时间（精确到秒）",
            "Expiration time (to seconds)",
          )}
        </FieldLabel>
        <span className="text-xs text-muted-foreground">{timeZone}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          {/* 日期选择 */}
          <div className="sm:col-span-7">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-between",
                    !expiresOn && "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    <CalendarIcon className="size-4 shrink-0 opacity-60" />
                    {formatDateLabel(locale, expiresOn)}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto overflow-hidden p-0"
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                <Calendar
                  mode="single"
                  selected={expiresOn}
                  defaultMonth={expiresOn}
                  onSelect={(value) => {
                    if (value) {
                      onExpiresOnChange(value);
                      if (!expiresTime) {
                        onExpiresTimeChange("23:59:59");
                      }
                    } else {
                      onExpiresOnChange(undefined);
                    }
                  }}
                  locale={locale === "zh-CN" ? zhCN : enUS}
                  captionLayout="dropdown"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 时间选择（时:分:秒） */}
          <div className="flex items-center gap-2 sm:col-span-5">
            <div className="relative flex flex-1 items-center">
              <Clock className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
              <Input
                id="gateway-key-expiry-time"
                type="time"
                step="1"
                value={expiresTime || "23:59:59"}
                onChange={(e) => {
                  const val = e.target.value;
                  onExpiresTimeChange(val);
                  if (!expiresOn && val) {
                    const now = new Date();
                    const parts = getTimeZoneDateParts(now, timeZone);
                    onExpiresOnChange(
                      new Date(parts.year, parts.month - 1, parts.day),
                    );
                  }
                }}
                className="w-full pl-8 font-mono text-sm"
                title={titleForLocale(locale, "时:分:秒", "HH:mm:ss")}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onClear}
              title={titleForLocale(locale, "清空为永不过期", "Clear expiry")}
            >
              {titleForLocale(locale, "清空", "Clear")}
            </Button>
          </div>
        </div>

        {/* 快捷设置预设 */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="mr-1 text-xs text-muted-foreground">
            {titleForLocale(locale, "快捷设定:", "Presets:")}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => applyPresetDays(1)}
          >
            +1 {titleForLocale(locale, "天", "Day")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => applyPresetDays(7)}
          >
            +7 {titleForLocale(locale, "天", "Days")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => applyPresetDays(30)}
          >
            +30 {titleForLocale(locale, "天", "Days")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => applyPresetEndOfDay()}
          >
            {titleForLocale(locale, "今日 23:59:59", "End of today")}
          </Button>
          {expiresOn ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={onClear}
            >
              {titleForLocale(locale, "设为永不过期", "Never expire")}
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}
