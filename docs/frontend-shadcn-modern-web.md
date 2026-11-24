# Frontend: shadcn/ui & Modern Web Guidance

Reference for building the web / Telegram Mini App UI in `tcbot-hono`.

## 1. shadcn/ui Theming (Tailwind CSS v4 + `oklch`)

Configure `globals.css` with `@theme inline`, `:root`, and `.dark` using `oklch(...)` tokens so semantic utilities (`bg-background`, `text-foreground`, `bg-primary`, `border-border`) adapt automatically to light/dark mode:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
}
```

## 2. Accessible Forms (`Field` + `react-hook-form` + `zod`)

Use shadcn/ui's `Field` primitives with `Controller` and `zodResolver`, keeping `data-invalid` and `aria-invalid` synchronized:

```tsx
<Controller
  name="username"
  control={form.control}
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={field.name}>Username</FieldLabel>
      <Input
        {...field}
        id={field.name}
        aria-invalid={fieldState.invalid}
        placeholder="shadcn"
      />
      <FieldDescription>Public display name.</FieldDescription>
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )}
/>
```

- Use `sonner` (`toast(...)`) for submit feedback.
- Keep `components.json` `aliases` (`components`, `ui`, `lib`, `hooks`, `utils`) in sync with `tsconfig.json` `paths` or `package.json#imports` (`#components/*`, etc.).

## 3. Modern Web Guidance Workflow

Before implementing custom UI, CSS layouts, or client-side JS:

1. **Search first:** `npx -y modern-web-guidance@latest search "<2-5 word generic query>"`
2. **Retrieve guides:** `npx -y modern-web-guidance@latest retrieve "<id>"`
3. **Follow Baseline rules:**
   - **Baseline Widely available** features can be used directly.
   - Newer features **must** include the guide's recommended fallback unless a stricter/newer browser target is configured.
4. **Framework adaptation:** Guard `window`/`HTMLElement` in SSR, generate unique per-instance IDs (`useId()`), and keep `:root` and `@starting-style` unscoped/top-level.
