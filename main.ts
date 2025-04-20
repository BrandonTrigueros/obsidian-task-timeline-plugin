import { App, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile } from 'obsidian';
import { TimelineView, VIEW_TYPE_TIMELINE } from './TimelineView';

interface TaskTimelineSettings {
	dateFormat: string;
	taskRegex: string;
	useCustomColors: boolean;
	defaultTagColor: string;
	tagColors: Record<string, string>;
	cardSize: 'small' | 'medium' | 'large';
	sortOrder: 'date-asc' | 'date-desc' | 'tag';
	showCompleted: boolean;
	refreshInterval: number;
	showFileNames: boolean;
	tagOrder: string[]; // Store the order of tags
	viewMode: 'timeline' | 'calendar'; // New setting for view mode
}

interface TaskFormatPreset {
    name: string;
    patternTemplate: string;
    dynamicPattern: string;
    exampleTemplate: string;
    example: string;
}

const DEFAULT_SETTINGS: TaskTimelineSettings = {
	dateFormat: 'DD-MMM-YYYY',
	taskRegex: '(.+?)\\s*->\\s*_([\\d]{1,2}-[A-Za-z]{3}-\\d{4})_\\s*(#[A-Za-z0-9_]+)',
	useCustomColors: false,
	defaultTagColor: '#5a8eee',
	tagColors: {},
	cardSize: 'medium',
	sortOrder: 'date-asc',
	showCompleted: false,
	refreshInterval: 5000,
	showFileNames: true,
	tagOrder: [],
	viewMode: 'timeline',
};

// Add this helper function at the class level or above
function generateRegexFromDateFormat(dateFormat: string, patternTemplate: string): string {
    // Convert user-friendly date format to regex pattern
    let dateRegexPart = dateFormat
        .replace('DD', '[\\d]{1,2}')
        .replace('MMM', '[A-Za-z]{3}')
        .replace('YYYY', '\\d{4}');
    
    // Insert the date regex into the pattern template
    return patternTemplate.replace('DATE_REGEX_PLACEHOLDER', dateRegexPart);
}

export default class TaskTimelinePlugin extends Plugin {
	settings: TaskTimelineSettings;
	refreshIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_TIMELINE,
			(leaf) => new TimelineView(leaf, this)
		);

		const ribbonIconEl = this.addRibbonIcon('calendar-clock', 'Task Timeline', () => {
			this.activateView();
		});
		ribbonIconEl.addClass('task-timeline-ribbon-class');

		this.addCommand({
			id: 'refresh-task-timeline',
			name: 'Refresh task timeline',
			callback: () => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);
				if (leaves.length) {
					(leaves[0].view as TimelineView).refresh();
				} else {
					this.activateView();
				}
			}
		});

		// Register events to refresh timeline when changes occur
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.refreshTimeline();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.refreshTimeline();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.refreshTimeline();
				}
			})
		);

		this.setupAutoRefresh();
		this.addSettingTab(new TaskTimelineSettingTab(this.app, this));
	}

	onunload() {
		this.clearAutoRefresh();
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIMELINE);
	}

	async activateView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);
		if (leaves.length) {
			this.app.workspace.revealLeaf(leaves[0]);
		} else {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_TIMELINE,
					active: true,
				});
				this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Helper method to refresh the timeline
	refreshTimeline() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);
		for (const leaf of leaves) {
			(leaf.view as TimelineView).refresh();
		}
	}

	setupAutoRefresh() {
		this.clearAutoRefresh();
		if (this.settings.refreshInterval > 0) {
			this.refreshIntervalId = window.setInterval(() => {
				this.refreshTimeline();
			}, this.settings.refreshInterval);
		}
	}

	clearAutoRefresh() {
		if (this.refreshIntervalId !== null) {
			window.clearInterval(this.refreshIntervalId);
			this.refreshIntervalId = null;
		}
	}
}

class TaskTimelineSettingTab extends PluginSettingTab {
    plugin: TaskTimelinePlugin;

    constructor(app: App, plugin: TaskTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Task Timeline Settings' });

        // --------- TASK FORMAT SECTION ---------
        containerEl.createEl('h3', { text: 'Task Format', cls: 'settings-header' });
        
        let dateFormatField: any;
        const dateSetting = new Setting(containerEl)
            .setName('Date format')
            .setDesc('Format used to parse dates in your tasks');

        dateSetting.addText(text => {
            dateFormatField = text;
            text.setPlaceholder('DD-MMM-YYYY')
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    
                    // Update regex patterns for all presets
                    formatPresets.forEach(preset => {
                        preset.dynamicPattern = generateRegexFromDateFormat(
                            value,
                            preset.patternTemplate
                        );
                        // Update examples with the new date format
                        preset.example = preset.exampleTemplate.replace("DD-MMM-YYYY", value);
                    });
                    
                    // If current selection is a preset, update the regex
                    const currentPreset = formatPresets.find(p => p.name === currentPresetName);
                    if (currentPreset) {
                        regexField.setValue(currentPreset.dynamicPattern);
                        this.plugin.settings.taskRegex = currentPreset.dynamicPattern;
                        
                        // Update the example display
                        const exampleEl = containerEl.querySelector(".task-format-example") as HTMLElement;
                        if (exampleEl) {
                            exampleEl.setText(currentPreset.example);
                        }
                    }
                    
                    await this.plugin.saveSettings();
                });
        });
        
        // Define preset formats with templates that can adapt to date format changes
        let currentPresetName = ""; // Track currently selected preset name
        const formatPresets = [
            {
                name: "Default Arrow Format",
                patternTemplate: "(.+?)\\s*->\\s*_DATE_REGEX_PLACEHOLDER_\\s*(#[A-Za-z0-9_]+)",
                dynamicPattern: "",
                exampleTemplate: "Complete project -> DD-MMM-YYYY #Work",
                example: ""
            },
            {
                name: "Checkbox Format",
                patternTemplate: "- \\[([ x])\\] (.+?)\\s*\\|\\s*DATE_REGEX_PLACEHOLDER\\s*(#[A-Za-z0-9_]+)",
                dynamicPattern: "",
                exampleTemplate: "- [ ] Complete project | DD-MMM-YYYY #Work",
                example: ""
            },
            {
                name: "Colon Format",
                patternTemplate: "(.+?)\\s*:\\s*DATE_REGEX_PLACEHOLDER\\s*(#[A-Za-z0-9_]+)",
                dynamicPattern: "",
                exampleTemplate: "Complete project: DD-MMM-YYYY #Work",
                example: ""
            },
            {
                name: "Due Date Format",
                patternTemplate: "(.+?)\\s*due\\s*DATE_REGEX_PLACEHOLDER\\s*(#[A-Za-z0-9_]+)",
                dynamicPattern: "",
                exampleTemplate: "Complete project due DD-MMM-YYYY #Work",
                example: ""
            }
        ];
        
        // Initialize dynamic patterns and examples with current date format
        formatPresets.forEach(preset => {
            preset.dynamicPattern = generateRegexFromDateFormat(
                this.plugin.settings.dateFormat,
                preset.patternTemplate
            );
            preset.example = preset.exampleTemplate.replace(
                "DD-MMM-YYYY", 
                this.plugin.settings.dateFormat
            );
        });

        // Add format preset selector
        const formatDesc = document.createDocumentFragment();
        formatDesc.append(
            createEl("p", { text: "Choose from predefined formats or enter your own pattern." }),
            createEl("div", { text: "Current example format:", cls: "setting-item-description" }),
            createEl("code", { cls: "task-format-example", text: "Loading..." })
        );
        
        const formatSetting = new Setting(containerEl)
            .setName('Task format')
            .setDesc(formatDesc);
        
        // Add dropdown for preset formats
        let regexField: any;
        formatSetting.addDropdown(dropdown => {
            // Add "Custom" option
            dropdown.addOption("custom", "Custom Pattern");
            
            // Add preset options
            formatPresets.forEach(preset => {
                dropdown.addOption(preset.name, preset.name);
            });
            
            // Set current value
            const currentPattern = this.plugin.settings.taskRegex;
            const matchingPreset = formatPresets.find(p => p.dynamicPattern === currentPattern);
            dropdown.setValue(matchingPreset ? matchingPreset.name : "custom");
            currentPresetName = matchingPreset ? matchingPreset.name : "custom";
            
            // Update example when dropdown changes
            dropdown.onChange(value => {
                currentPresetName = value;
                const preset = formatPresets.find(p => p.name === value);
                const exampleEl = containerEl.querySelector(".task-format-example") as HTMLElement;
                
                if (preset) {
                    // Found a preset
                    exampleEl.setText(preset.example);
                    regexField.setValue(preset.dynamicPattern);
                    this.plugin.settings.taskRegex = preset.dynamicPattern;
                    this.plugin.saveSettings();
                } else {
                    // Custom option
                    exampleEl.setText("Custom pattern");
                }
            });
            
            // Initialize example text
            setTimeout(() => {
                const initialValue = dropdown.getValue();
                const preset = formatPresets.find(p => p.name === initialValue);
                const exampleEl = containerEl.querySelector(".task-format-example") as HTMLElement;
                if (preset) {
                    exampleEl.setText(preset.example);
                } else {
                    exampleEl.setText("Custom pattern");
                }
            }, 50);
        });
        
        // Add text field for custom regex
        formatSetting.addText(text => {
            regexField = text;
            text.setPlaceholder("Regular expression pattern")
                .setValue(this.plugin.settings.taskRegex)
                .onChange(async (value) => {
                    this.plugin.settings.taskRegex = value;
                    currentPresetName = "custom"; // When manually editing, switch to custom mode
                    await this.plugin.saveSettings();
                });
        });

        // --------- VIEW SETTINGS SECTION ---------
        containerEl.createEl('h3', { text: 'View Settings', cls: 'settings-header' });
        
        new Setting(containerEl)
            .setName('Default view')
            .setDesc('Choose between timeline or calendar view')
            .addDropdown(dropdown => dropdown
                .addOption('timeline', 'Timeline View')
                .addOption('calendar', 'Calendar View')
                .setValue(this.plugin.settings.viewMode)
                .onChange(async (value) => {
                    this.plugin.settings.viewMode = value as 'timeline' | 'calendar';
                    await this.plugin.saveSettings();
                    this.plugin.refreshTimeline();
                }));
                
        new Setting(containerEl)
            .setName('Show file names')
            .setDesc('Display the source file name for each task')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showFileNames)
                .onChange(async (value) => {
                    this.plugin.settings.showFileNames = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show completed tasks')
            .setDesc('Include tasks that are marked as completed')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCompleted)
                .onChange(async (value) => {
                    this.plugin.settings.showCompleted = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Auto-refresh interval')
            .setDesc('How often the timeline should refresh (in seconds, 0 to disable)')
            .addSlider(slider => slider
                .setLimits(0, 60, 5)
                .setValue(this.plugin.settings.refreshInterval / 1000)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.refreshInterval = value * 1000;
                    await this.plugin.saveSettings();
                    this.plugin.setupAutoRefresh();
                }));

        // --------- DISPLAY SETTINGS SECTION ---------
        containerEl.createEl('h3', { text: 'Display Settings', cls: 'settings-header' });

        new Setting(containerEl)
            .setName('Card size')
            .setDesc('Set the size of task cards')
            .addDropdown(dropdown => dropdown
                .addOption('small', 'Small')
                .addOption('medium', 'Medium')
                .addOption('large', 'Large')
                .setValue(this.plugin.settings.cardSize)
                .onChange(async (value) => {
                    this.plugin.settings.cardSize = value as 'small' | 'medium' | 'large';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sort order')
            .setDesc('How to sort tasks in the timeline')
            .addDropdown(dropdown => dropdown
                .addOption('date-asc', 'Date (earliest first)')
                .addOption('date-desc', 'Date (latest first)')
                .addOption('tag', 'By tag')
                .setValue(this.plugin.settings.sortOrder)
                .onChange(async (value) => {
                    this.plugin.settings.sortOrder = value as 'date-asc' | 'date-desc' | 'tag';
                    await this.plugin.saveSettings();
                }));

        // --------- COLOR SETTINGS SECTION ---------
        containerEl.createEl('h3', { text: 'Color Settings', cls: 'settings-header' });

        new Setting(containerEl)
            .setName('Use custom colors')
            .setDesc('Use custom colors for tags instead of auto-generated ones')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCustomColors)
                .onChange(async (value) => {
                    this.plugin.settings.useCustomColors = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default tag color')
            .setDesc('The color to use for tags without a custom color')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.defaultTagColor)
                .onChange(async (value) => {
                    this.plugin.settings.defaultTagColor = value;
                    await this.plugin.saveSettings();
                }));

        // --------- RESET SETTINGS SECTION ---------
        containerEl.createEl('h3', { text: 'Backup & Reset', cls: 'settings-header' });
        
        new Setting(containerEl)
            .setName('Reset to defaults')
            .setDesc('Reset all settings to their default values')
            .addButton(button => button
                .setButtonText('Reset All Settings')
                .setWarning()
                .onClick(async () => {
                    // Show confirmation dialog
                    const confirmReset = confirm(
                        'Are you sure you want to reset all settings to their defaults? ' + 
                        'This cannot be undone and will refresh your timeline view.'
                    );
                    
                    if (confirmReset) {
                        // Reset all settings to defaults
                        this.plugin.settings = {...DEFAULT_SETTINGS};
                        await this.plugin.saveSettings();
                        
                        // Refresh the settings panel
                        this.display();
                        
                        // Refresh the timeline view
                        this.plugin.refreshTimeline();
                        
                        // Show success notification
                        new Notice('Settings have been reset to defaults');
                    }
                }));
    }
}
