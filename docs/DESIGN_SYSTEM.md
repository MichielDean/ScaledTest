# Design System and CSS Architecture

This document explains the design system approach used in ScaledTest to maintain consistency and follow DRY principles.

## Design Tokens

All design tokens are centralized in `/src/styles/design-tokens.css`. This file contains:

### Color Palette

- **Primary**: Blue variants for main actions and branding
- **Secondary**: Gray variants for secondary actions
- **Semantic Colors**: Success (green), Warning (yellow), Danger/Error (red), Info (blue)
- **Gray Scale**: 50-900 for backgrounds, borders, and text
- **Text Colors**: Primary, secondary, tertiary, and inverse

### Spacing Scale

- **Spacing tokens**: xs (0.25rem) to 3xl (3rem) using consistent 0.25rem increments
- **Usage**: `var(--spacing-lg)` instead of hardcoded values

### Typography

- **Font sizes**: xs to 5xl using a consistent scale
- **Font weights**: normal, medium, semibold, bold
- **Line heights**: tight, normal, relaxed

### Other Tokens

- **Border radius**: sm to full for different contexts
- **Shadows**: 5 levels from subtle to prominent
- **Transitions**: fast, normal, slow for consistent animations
- **Z-index**: Named layers for proper stacking

## CSS Architecture

### 1. Shared Styles

Located in `/src/styles/shared/`:

- **`common.module.css`**: Layout utilities, typography, spacing
- **`buttons.module.css`**: Button variants and states
- **`alerts.module.css`**: Alert and message components
- **`cards.module.css`**: Card containers and stat cards
- **`forms.module.css`**: Form inputs, labels, and layouts
- **`tables.module.css`**: Table styling with variants

### 2. Component-Specific Modules

Each component has its own CSS module that:

- Uses design tokens for consistency
- Contains only component-specific styles
- Avoids duplication by referencing shared patterns

## Usage Guidelines

### Using Design Tokens

```css
/* ✅ Good - uses design tokens */
.button {
  background-color: var(--color-primary);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius);
  transition: background-color var(--transition-normal);
}

/* ❌ Bad - hardcoded values */
.button {
  background-color: #2563eb;
  padding: 0.75rem 1rem;
  border-radius: 0.25rem;
  transition: background-color 0.2s ease-in-out;
}
```

### Component CSS Structure

```css
/* Component-specific styles using design tokens */
.componentName {
  /* Layout */
  padding: var(--spacing-lg);

  /* Colors */
  background-color: var(--color-background);
  color: var(--color-text-primary);

  /* Typography */
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);

  /* Effects */
  border-radius: var(--border-radius);
  box-shadow: var(--shadow);
  transition: all var(--transition-normal);
}
```

## Benefits

1. **Consistency**: All components use the same color palette, spacing, and typography
2. **Maintainability**: Changes to design tokens propagate across the entire application
3. **DRY Principle**: No duplication of common styles
4. **Scalability**: Easy to add new components following established patterns
5. **Accessibility**: Consistent focus states and semantic colors
6. **Performance**: Shared styles reduce CSS bundle size

## Adding New Components

When creating a new component:

1. **Check existing patterns**: Look for similar components in `/src/styles/shared/`
2. **Use design tokens**: Always prefer tokens over hardcoded values
3. **Create component CSS**: Only add styles that are unique to your component
4. **Update shared styles**: If you create reusable patterns, add them to shared modules

## Migration Notes

Existing components have been updated to use this system:

- Legacy CSS variables in `globals.css` are maintained for backwards compatibility
- All inline styles have been moved to CSS modules
- Design tokens provide a consistent foundation for future development

## File Structure

```
src/styles/
├── design-tokens.css           # Central design tokens
├── globals.css                 # Global styles and legacy compatibility
├── shared/                     # Shared CSS modules
│   ├── common.module.css       # Layout and typography utilities
│   ├── buttons.module.css      # Button variants
│   ├── alerts.module.css       # Alert messages
│   ├── cards.module.css        # Card containers
│   ├── forms.module.css        # Form elements
│   └── tables.module.css       # Table styling
└── [Component].module.css      # Component-specific styles
```

This approach ensures a maintainable, consistent, and scalable CSS architecture that follows modern best practices.
