import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile } from 'obsidian';
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
};

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

		// Basic Settings
		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Format used to parse dates in your tasks')
			.addText(text => text
				.setPlaceholder('DD-MMM-YYYY')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Task regex pattern')
			.setDesc('Regular expression used to match task patterns in your notes')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.taskRegex)
				.setValue(this.plugin.settings.taskRegex)
				.onChange(async (value) => {
					this.plugin.settings.taskRegex = value;
					await this.plugin.saveSettings();
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

		// Display Settings
		containerEl.createEl('h3', { text: 'Display Settings' });

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

		// Color Settings
		containerEl.createEl('h3', { text: 'Color Settings' });

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
	}
}
