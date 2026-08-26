---
name: components-v2-layout
description: Guide for layout components (Container, Section, Separator) in Discord Components v2
metadata:
  version: "2.0"
---

# Layout Components (Components v2)

## What this skill does
Reference for creating message layouts using Container, Section, and Separator components.

## When to use
- Structure complex messages with multiple elements
- Create horizontal layouts with text and buttons
- Add visual spacing and dividers
- Replace legacy embeds with modern Components v2

## ⚠️ IMPORTANT: IS_COMPONENTS_V2 Flag
All messages using these components **must** set the `IS_COMPONENTS_V2` flag.

```rust
ctx.send(poise::CreateReply::default()
    .flags(serenity::MessageFlags::IS_COMPONENTS_V2)
    .components(components)
).await?;
```

---

# Container (Type 17)

## What is Container?
The primary wrapper for all Components v2 messages. Acts like a legacy embed but with more flexibility.

## Creating Containers

### Basic Container
```rust
use poise::serenity_prelude as serenity;

let inner_components = vec![
    serenity::CreateContainerComponent::TextDisplay(
        serenity::CreateTextDisplay::new("Hello World!")
    ),
];

let container = serenity::CreateContainer::new(inner_components);

// Use in message
vec![serenity::CreateComponent::Container(container)]
```

### Container with Accent Color
```rust
serenity::CreateContainer::new(inner_components)
    .accent_color(0x5865F2)  // Blurple
```

### Building Container Components
```rust
let mut inner_components: Vec<serenity::CreateContainerComponent> = vec![];

// Add text
inner_components.push(serenity::CreateContainerComponent::TextDisplay(
    serenity::CreateTextDisplay::new("## Title")
));

// Add separator
inner_components.push(serenity::CreateContainerComponent::Separator(
    serenity::CreateSeparator::new(false)
));

// Add section
inner_components.push(serenity::CreateContainerComponent::Section(
    serenity::CreateSection::new(
        vec![serenity::CreateSectionComponent::TextDisplay(
            serenity::CreateTextDisplay::new("Content")
        )],
        serenity::CreateSectionAccessory::Button(button)
    )
));

// Wrap in Container
let container = serenity::CreateContainer::new(inner_components);
```

## Full Message Example
```rust
pub async fn send_message(ctx: Context<'_>) -> Result<(), Error> {
    let mut inner_components = vec![];
    
    inner_components.push(serenity::CreateContainerComponent::TextDisplay(
        serenity::CreateTextDisplay::new("## Welcome!")
    ));
    
    inner_components.push(serenity::CreateContainerComponent::Separator(
        serenity::CreateSeparator::new(true)
    ));
    
    let components = vec![
        serenity::CreateComponent::Container(
            serenity::CreateContainer::new(inner_components)
                .accent_color(0x57F287)  // Green
        )
    ];
    
    ctx.send(poise::CreateReply::default()
        .flags(serenity::MessageFlags::IS_COMPONENTS_V2)
        .components(components)
    ).await?;
    
    Ok(())
}
```

---

# Section (Type 9)

## What is Section?
Creates horizontal layouts with 1-3 text blocks on the left and an optional accessory (button/thumbnail) on the right.

## Creating Sections

### Section with Text and Button
```rust
serenity::CreateSection::new(
    vec![
        serenity::CreateSectionComponent::TextDisplay(
            serenity::CreateTextDisplay::new("**Module Status**")
        ),
    ],
    serenity::CreateSectionAccessory::Button(
        serenity::CreateButton::new("toggle_module")
            .label("Enable")
            .style(serenity::ButtonStyle::Success)
    ),
)
```

### Section with Multiple Text Blocks
```rust
serenity::CreateSection::new(
    vec![
        serenity::CreateSectionComponent::TextDisplay(
            serenity::CreateTextDisplay::new("**Title**")
        ),
        serenity::CreateSectionComponent::TextDisplay(
            serenity::CreateTextDisplay::new("Description text")
        ),
        serenity::CreateSectionComponent::TextDisplay(
            serenity::CreateTextDisplay::new("*Additional info*")
        ),
    ],
    serenity::CreateSectionAccessory::Button(button),
)
```

### Section Accessories

#### Button Accessory
```rust
serenity::CreateSectionAccessory::Button(
    serenity::CreateButton::new("action_id")
        .label("Action")
        .style(serenity::ButtonStyle::Primary)
)
```

#### Thumbnail Accessory (Not yet in codebase)
```rust
serenity::CreateSectionAccessory::Thumbnail(
    serenity::CreateThumbnail::new("https://example.com/image.png")
)
```

## Common Section Patterns

### Settings Row
```rust
// From src/services/config/builders.rs
serenity::CreateContainerComponent::Section(
    serenity::CreateSection::new(
        vec![
            serenity::CreateSectionComponent::TextDisplay(
                serenity::CreateTextDisplay::new(format!(
                    "**{}**\n{}",
                    module_name,
                    description
                ))
            ),
        ],
        serenity::CreateSectionAccessory::Button(
            serenity::CreateButton::new(format!("config_module_toggle_{}", module_type))
                .label(if enabled { "Enabled" } else { "Disabled" })
                .style(if enabled {
                    serenity::ButtonStyle::Success
                } else {
                    serenity::ButtonStyle::Danger
                })
        ),
    ),
)
```

### Header with Back Button
```rust
// From src/services/config/whitelist.rs
serenity::CreateContainerComponent::Section(
    serenity::CreateSection::new(
        vec![serenity::CreateSectionComponent::TextDisplay(
            serenity::CreateTextDisplay::new(format!("## {}", title))
        )],
        serenity::CreateSectionAccessory::Button(
            serenity::CreateButton::new(back_id)
                .label("Back")
                .style(serenity::ButtonStyle::Secondary)
        ),
    ),
)
```

---

# Separator (Type 14)

## What is Separator?
Adds visual spacing or dividers between components.

## Creating Separators

### Non-Spacing Separator (Thin Line)
```rust
serenity::CreateSeparator::new(false)
```

### Spacing Separator (Thick Line + Space)
```rust
serenity::CreateSeparator::new(true)
```

## Usage in Container
```rust
let mut components = vec![];

// Add content
components.push(serenity::CreateContainerComponent::TextDisplay(
    serenity::CreateTextDisplay::new("Section 1")
));

// Add separator
components.push(serenity::CreateContainerComponent::Separator(
    serenity::CreateSeparator::new(false)  // Thin divider
));

// Add more content
components.push(serenity::CreateContainerComponent::TextDisplay(
    serenity::CreateTextDisplay::new("Section 2")
));

// Add spacing separator
components.push(serenity::CreateContainerComponent::Separator(
    serenity::CreateSeparator::new(true)  // Thick divider with space
));
```

## When to Use

### Non-Spacing (false)
- Between closely related sections
- After headers
- Between list items

### Spacing (true)
- Between major sections
- Before/after important content
- To create visual breaks

---

# Complete Layout Example

```rust
pub fn build_status_message(
    enabled: bool,
    description: &str,
) -> Vec<serenity::CreateComponent> {
    let mut inner_components = vec![];
    
    // Header
    inner_components.push(serenity::CreateContainerComponent::TextDisplay(
        serenity::CreateTextDisplay::new("## Module Configuration")
    ));
    
    // Separator after header
    inner_components.push(serenity::CreateContainerComponent::Separator(
        serenity::CreateSeparator::new(false)
    ));
    
    // Status section with toggle button
    inner_components.push(serenity::CreateContainerComponent::Section(
        serenity::CreateSection::new(
            vec![
                serenity::CreateSectionComponent::TextDisplay(
                    serenity::CreateTextDisplay::new(format!(
                        "**Status**: {}\n{}",
                        if enabled { "Enabled ✅" } else { "Disabled ❌" },
                        description
                    ))
                ),
            ],
            serenity::CreateSectionAccessory::Button(
                serenity::CreateButton::new("toggle")
                    .label(if enabled { "Disable" } else { "Enable" })
                    .style(if enabled {
                        serenity::ButtonStyle::Danger
                    } else {
                        serenity::ButtonStyle::Success
                    })
            ),
        ),
    ));
    
    // Spacing separator
    inner_components.push(serenity::CreateContainerComponent::Separator(
        serenity::CreateSeparator::new(true)
    ));
    
    // Info text
    inner_components.push(serenity::CreateContainerComponent::TextDisplay(
        serenity::CreateTextDisplay::new("*Click the button to toggle*")
    ));
    
    // Wrap in container
    vec![serenity::CreateComponent::Container(
        serenity::CreateContainer::new(inner_components)
            .accent_color(if enabled { 0x57F287 } else { 0xED4245 })
    )]
}
```

---

# Architecture Pattern

The codebase follows this pattern consistently:

```rust
// 1. Build inner components vector
let mut inner_components: Vec<serenity::CreateContainerComponent> = vec![];

// 2. Add components
inner_components.push(serenity::CreateContainerComponent::TextDisplay(...));
inner_components.push(serenity::CreateContainerComponent::Separator(...));
inner_components.push(serenity::CreateContainerComponent::Section(...));

// 3. Wrap in Container
let container = serenity::CreateContainer::new(inner_components);

// 4. Wrap in CreateComponent enum
let components = vec![serenity::CreateComponent::Container(container)];

// 5. Send with IS_COMPONENTS_V2 flag
ctx.send(poise::CreateReply::default()
    .flags(serenity::MessageFlags::IS_COMPONENTS_V2)
    .components(components)
).await?;
```

---

# Best Practices

1. **Always use Container** - Required wrapper for Components v2
2. **Set IS_COMPONENTS_V2 flag** - Messages will fail without it
3. **Use Sections for layouts** - Text + button horizontal layouts
4. **Separators for organization** - Visual structure and spacing
5. **Accent colors** - Match semantic meaning (green=success, red=danger)
6. **Max 3 text blocks in Section** - Discord limitation
7. **Build incrementally** - Use Vec and push for flexibility
8. **Consistent spacing** - Use separators strategically

---

# Codebase Examples

**Container:**
- `src/services/logger.rs:120-122` - Logger message with accent color
- `src/services/status.rs:166-168` - Status display
- `src/services/help.rs:78-80` - Help system
- `src/services/config/mod.rs:212` - Configuration menu

**Section:**
- `src/services/config/whitelist.rs:159-169` - Header with back button
- `src/services/config/builders.rs:61-67` - Module toggle section
- `src/services/setup/steps/logging.rs:28-38` - Setup step with button

**Separator:**
- `src/services/config/mod.rs:73-74` - Non-spacing separator
- `src/services/logger.rs:96-97` - Spacing separator
- `src/services/status.rs:59-60` - Visual divider
- `src/services/help.rs:37-38` - Section separator

---

# See Also
- `components-v2-content` - Text Display, Thumbnail, Media, Files
- `components-v2-interactive` - Buttons, Selects, Action Rows
- `components-v2-modals` - Modals with Labels
