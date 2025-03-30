import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { TimelineView, VIEW_TYPE_TIMELINE } from './TimelineView';

interface TaskTimelineSettings {
	dateFormat: string;
	taskRegex: string;
}

const DEFAULT_SETTINGS: TaskTimelineSettings = {
	dateFormat: 'DD-MMM-YYYY',
	taskRegex: '(.+?)\\s*->\\s*_([\\d]{1,2}-[A-Za-z]{3}-\\d{4})_\\s*(#[A-Za-z0-9_]+)'
};

export default class TaskTimelinePlugin extends Plugin {
	settings: TaskTimelineSettings;

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

		this.addSettingTab(new TaskTimelineSettingTab(this.app, this));
	}

	onunload() {
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
	}
}
