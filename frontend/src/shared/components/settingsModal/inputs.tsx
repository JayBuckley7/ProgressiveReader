export function TextInput({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  placeholder = "",
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="app-form-label">{label}</label>
      {multiline ? (
        <textarea
          className="app-input w-full px-3 py-2 text-sm leading-5 min-h-[110px] resize-y placeholder:opacity-70"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="app-input w-full px-3 py-2 text-sm leading-5 placeholder:opacity-70"
          value={value}
          type={type}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
        />
      )}
    </div>
  );
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string } | string>;
}) {
  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  return (
    <div className="space-y-1.5">
      <label className="app-form-label">{label}</label>
      <select
        className="app-input w-full px-3 py-2 text-sm leading-5 cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {normalizedOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="app-form-label">{label}</label>
        <span className="app-chip font-mono">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="app-range"
      />
      <div className="flex justify-between text-xs app-muted">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

export function CheckboxInput({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="app-checkbox mt-0.5 cursor-pointer"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs app-muted mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
    </label>
  );
}

