import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import TaskTimelinePlugin from './main';

export const VIEW_TYPE_TIMELINE = 'task-timeline-view';

interface TimelineTask {
	text: string;
	date: Date;
	tag: string;
	filePath: string;
	fileName: string;
}

export class TimelineView extends ItemView {
	plugin: TaskTimelinePlugin;
	tasks: TimelineTask[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: TaskTimelinePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TIMELINE;
	}

	getDisplayText(): string {
		return 'Task Timeline';
	}

	async onOpen() {
		await this.refresh();
	}

	async refresh() {
		this.tasks = [];
		await this.loadTasks();
		this.renderTimeline();
	}

	async loadTasks() {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const taskRegex = new RegExp(this.plugin.settings.taskRegex, 'g');

		for (const file of markdownFiles) {
			const content = await this.app.vault.cachedRead(file);
			let match;

			while ((match = taskRegex.exec(content)) !== null) {
				const text = match[1].trim();
				const dateStr = match[2].trim();
				const tag = match[3].trim();
				const date = this.parseDate(dateStr);

				if (date) {
					this.tasks.push({
						text,
						date,
						tag,
						filePath: file.path,
						fileName: file.basename,
					});
				}
			}
		}

		this.tasks.sort((a, b) => a.date.getTime() - b.date.getTime());
	}

	parseDate(dateStr: string): Date | null {
		const parts = dateStr.split('-');
		if (parts.length !== 3) return null;

		const day = parseInt(parts[0], 10);
		const month = this.getMonthNumber(parts[1]);
		const year = parseInt(parts[2], 10);

		return isNaN(day) || isNaN(month) || isNaN(year) ? null : new Date(year, month, day);
	}

	getMonthNumber(monthStr: string): number {
		const months: Record<string, number> = {
			jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
			jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
		};
		return months[monthStr.toLowerCase()] ?? -1;
	}

	renderTimeline() {
		const container = this.containerEl.children[1];
		container.empty();

		if (this.tasks.length === 0) {
			container.createEl('div', { text: 'No tasks found.' });
			return;
		}

		const groupedTasks: Record<string, TimelineTask[]> = {};
		for (const task of this.tasks) {
			if (!groupedTasks[task.tag]) groupedTasks[task.tag] = [];
			groupedTasks[task.tag].push(task);
		}

		const timelineContainer = container.createDiv({ cls: 'timeline-container' });

		for (const tag in groupedTasks) {
			const groupContainer = timelineContainer.createDiv({ cls: 'timeline-group' });
			groupContainer.createEl('h3', { text: tag, cls: 'timeline-group-header' });

			const tasksContainer = groupContainer.createDiv({ cls: 'timeline-tasks' });
			for (const task of groupedTasks[tag]) {
				const taskEl = tasksContainer.createDiv({ cls: 'timeline-task' });
				taskEl.createDiv({ cls: 'timeline-task-date', text: this.formatDate(task.date) });
				taskEl.createDiv({ cls: 'timeline-task-text', text: task.text });
				taskEl.createDiv({ cls: 'timeline-task-source', text: `From: ${task.fileName}` });

				taskEl.addEventListener('click', () => {
					const file = this.app.vault.getAbstractFileByPath(task.filePath);
					if (file instanceof TFile) {
						this.app.workspace.getLeaf().openFile(file);
					}
				});
			}
		}
	}

	formatDate(date: Date): string {
		const day = date.getDate().toString().padStart(2, '0');
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const month = months[date.getMonth()];
		const year = date.getFullYear();
		return `${day}-${month}-${year}`;
	}
}
