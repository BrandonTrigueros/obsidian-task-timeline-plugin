# Task Timeline for Obsidian

Create a beautiful timeline view of your tasks across your notes. Organize and visualize your tasks based on dates and tags with an interactive timeline that supports custom colors, grouping, and auto-refresh.

## Features

- **Timeline View**: Visualize tasks sorted by date and grouped by tag.
- **Custom Date Parsing**: Parse dates using a configurable format (default: `DD-MMM-YYYY`).
- **Task Grouping**: Automatically groups tasks by tag with expandable/collapsible groups.
- **Color Customization**: Use auto-generated or custom colors for tag groups.
- **Overdue and Reminder Indicators**: Display task status (Today, Tomorrow, Overdue, or number of days left).
- **File Navigation**: Click a task to open its source file quickly.
- **Auto-Refresh**: Timeline updates regularly as your notes change.

## How to Use

1. **Formatting Tasks**

   Add tasks to your notes using the format: `Task description -> DD-MMM-YYYY #Tag`

   Examples:

   ```markdown
   Write plugin documentation -> 15-Oct-2023 #Work
   Submit report -> 10-Oct-2023 #Finance
   Schedule team meeting -> 20-Oct-2023 #Work #Important
   ```

   The task format requires:
  
   - A description
   - An arrow `->` followed by a date
   - Tags with `#` prefix

2. **Timeline Interaction**

   When viewing your timeline, you can:

   **Hotkeys & Actions:**

   | Hotkey                      | Action                            |
   |-----------------------------|-----------------------------------|
   | Click on a task             | Open the source file              |
   | Click on a tag header       | Expand/Collapse the tag group     |
   | Drag a tag header           | Reorder tag groups                |
   | Right-click on a tag header | Choose a custom tag color         |

## How to Install

### From Within Obsidian

1. Open **Settings > Community plugins**
2. Make sure **Safe mode** is off
3. Click **Browse community plugins**
4. Search for **Task Timeline**
5. Click **Install**
6. Close the plugins window and enable **Task Timeline**

## Demo

![Task Timeline Demo](https://example.com/screenshot.png)

## Support & Contributions

This plugin is provided for free. If you like it or want to support ongoing development, feel free to contribute or donate:

[![GitHub Sponsors](https://img.shields.io/github/sponsors/BrandonTrigueros?style=social)](https://github.com/sponsors/BrandonTrigueros)
[![Paypal](https://img.shields.io/badge/paypal-BrandonTrigueros-yellow?style=social&logo=paypal)](https://www.paypal.me/BrandonTrigueros)
[![BuyMeACoffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/BrandonTrigueros)

## Notes

_This plugin is still experimental. Please make backups of your notes before using, as bugs might lead to unexpected behavior._

---

Feel free to file issues or contribute on GitHub:

- [Issues](https://github.com/BrandonTrigueros/obsidian-task-timeline-plugin/issues)
- [Pull Requests](https://github.com/BrandonTrigueros/obsidian-task-timeline-plugin/pulls)
