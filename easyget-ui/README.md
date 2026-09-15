# @easyget/ui

Easyget's reusable design system for React projects.

The system describes a restrained, light, tool-oriented interface: cool gray canvas, white surfaces, dark primary actions, low-saturation blue links, thin borders, moderate radii, and quiet elevation.

## Use in a Vite/React project

Copy this package into the project or publish it privately, then import the styles once:

```tsx
import '@easyget/ui/styles.css';
import { Button, Card, Field, Input } from '@easyget/ui';
```

```tsx
<Card>
  <Field label="核心搜索词" required htmlFor="keyword">
    <Input id="keyword" placeholder="输入关键词" />
  </Field>
  <Button>保存配置</Button>
</Card>
```

## Rules

- Product CSS should use semantic `--eg-*` tokens instead of raw color values.
- Use `Button` for actions and keep one primary action per section.
- Use `Field` with `Input`, `Select`, or `Textarea` for forms so labels, hints, and errors stay consistent.
- Use `Card` for grouped content and `Badge` for compact status labels.
- Use `Switch` for binary settings and always provide a visible label when the control is not self-explanatory.
- Use the `eg-heading-*` and `eg-text-*` classes for shared text hierarchy when a product does not need its own typography component.
- Keep data tables, clue drawers, and domain-specific panels in the product layer until the same pattern appears in at least two products.

## Token layers

- `--eg-color-*`: palette values. Use these only when defining or extending semantic tokens.
- `--eg-bg-*`, `--eg-fg-*`, `--eg-border-*`, `--eg-action-*`: semantic product tokens.
- `--eg-space-*`, `--eg-radius-*`, `--eg-shadow-*`, `--eg-text-*`: shared geometry and typography scales.

The legacy aliases such as `--bg-body`, `--text-primary`, and `--brand-primary` are kept so existing Easyget screens can migrate incrementally.
