import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import TaskTimelinePlugin from './main';

export const VIEW_TYPE_TIMELINE = 'task-timeline-view';

interface TimelineTask {
	text: string;
	date: Date;
	tag: string;
	filePath: string;
	fileName: string;
	daysLeft?: number;
	isCompleted?: boolean;
	isOverdue?: boolean; // Added to track overdue tasks
}

export class TimelineView extends ItemView {
	plugin: TaskTimelinePlugin;
	tasks: TimelineTask[] = [];
	collapsedGroups: Set<string> = new Set();

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
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (const file of markdownFiles) {
			const content = await this.app.vault.cachedRead(file);
			let match;

			while ((match = taskRegex.exec(content)) !== null) {
				const text = match[1].trim();
				const dateStr = match[2].trim();
				const tag = match[3].trim();
				const date = this.parseDate(dateStr);
				const isCompleted = text.startsWith('[x]') || text.startsWith('- [x]');

				if (!this.plugin.settings.showCompleted && isCompleted) continue;

				if (date) {
					const timeDiff = date.getTime() - today.getTime();
					const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
					const isOverdue = daysLeft < 0; // Determine if the task is overdue

					this.tasks.push({
						text,
						date,
						tag,
						filePath: file.path,
						fileName: file.basename,
						daysLeft,
						isCompleted,
						isOverdue // Add overdue status to the task
					});
				}
			}
		}

		switch (this.plugin.settings.sortOrder) {
			case 'date-asc':
				this.tasks.sort((a, b) => a.date.getTime() - b.date.getTime());
				break;
			case 'date-desc':
				this.tasks.sort((a, b) => b.date.getTime() - a.date.getTime());
				break;
			case 'tag':
				this.tasks.sort((a, b) => a.tag.localeCompare(b.tag));
				break;
		}
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

	private getTagColor(tag: string): string {
		if (this.plugin.settings.useCustomColors) {
			const tagName = tag.startsWith('#') ? tag.substring(1) : tag;
			return this.plugin.settings.tagColors[tagName] || this.plugin.settings.defaultTagColor;
		}
		let hash = 0;
		for (let i = 0; i < tag.length; i++) {
			hash = tag.charCodeAt(i) + ((hash << 5) - hash);
		}
		let color = '#';
		for (let i = 0; i < 3; i++) {
			const value = (hash >> (i * 8)) & 0xFF;
			const adjustedValue = 100 + (value % 100);
			color += adjustedValue.toString(16).padStart(2, '0');
		}
		return color;
	}

	renderTimeline() {
		const container = this.containerEl.children[1];
		container.empty();

		if (this.tasks.length === 0) {
			container.createEl('div', { text: 'No future tasks found.' });
			return;
		}

		const groupedTasks: Record<string, TimelineTask[]> = {};
		for (const task of this.tasks) {
			if (!groupedTasks[task.tag]) groupedTasks[task.tag] = [];
			groupedTasks[task.tag].push(task);
		}

		const timelineContainer = container.createDiv({ cls: 'timeline-container' });

		// Sort tags according to saved order
		const sortedTags = Object.keys(groupedTasks);
		sortedTags.sort((a, b) => {
			const indexA = this.plugin.settings.tagOrder.indexOf(a);
			const indexB = this.plugin.settings.tagOrder.indexOf(b);

			if (indexA === -1 && indexB === -1) return a.localeCompare(b);
			if (indexA === -1) return 1;
			if (indexB === -1) return -1;
			return indexA - indexB;
		});

		// Render groups in the sorted order
		for (const tag of sortedTags) {
			const groupContainer = timelineContainer.createDiv({ cls: 'timeline-group' });
			const tagColor = this.getTagColor(tag);

			const header = groupContainer.createEl('h3', { 
				text: tag, 
				cls: 'timeline-group-header' 
			});
			header.style.backgroundColor = tagColor;

			const tasksContainer = groupContainer.createDiv({ cls: 'timeline-tasks' });
			tasksContainer.style.setProperty('--tag-color', tagColor);

			// Apply collapsed state from saved data
			if (this.collapsedGroups.has(tag)) {
				tasksContainer.classList.add('collapsed');
				header.classList.add('collapsed');
			}

			header.addEventListener('click', (e) => {
				e.stopPropagation();
				tasksContainer.classList.toggle('collapsed');
				header.classList.toggle('collapsed');
				
				// Save collapsed state
				if (tasksContainer.classList.contains('collapsed')) {
					this.collapsedGroups.add(tag);
				} else {
					this.collapsedGroups.delete(tag);
				}
			});

			// Add draggable attribute to header
			header.setAttribute('draggable', 'true');

			// Add drag event listeners
			header.addEventListener('dragstart', (e) => {
				if (e.dataTransfer) {
					e.dataTransfer.setData('text/plain', tag);
				}
			});

			header.addEventListener('dragover', (e) => {
				e.preventDefault();
			});

			header.addEventListener('drop', (e) => {
				e.preventDefault();
				if (!e.dataTransfer) return;
				const draggedTag = e.dataTransfer.getData('text/plain');
				if (draggedTag !== tag) {
					// Update the tag order
					const newOrder = [...this.plugin.settings.tagOrder];
					const draggedIndex = newOrder.indexOf(draggedTag);
					const targetIndex = newOrder.indexOf(tag);

					if (draggedIndex === -1) {
						newOrder.splice(targetIndex === -1 ? newOrder.length : targetIndex, 0, draggedTag);
					} else if (targetIndex === -1) {
						newOrder.splice(draggedIndex, 1);
						newOrder.push(draggedTag);
					} else {
						newOrder.splice(draggedIndex, 1);
						newOrder.splice(targetIndex, 0, draggedTag);
					}

					this.plugin.settings.tagOrder = newOrder;
					this.plugin.saveSettings();
					this.refresh();
				}
			});

			// Add right-click for color selection
			header.addEventListener('contextmenu', (e) => {
				e.preventDefault();

				// Create a color picker
				const colorPicker = document.createElement('input');
				colorPicker.type = 'color';
				colorPicker.value = this.getTagColor(tag);

				// When a color is selected, update settings
				colorPicker.addEventListener('change', () => {
					const tagName = tag.startsWith('#') ? tag.substring(1) : tag;
					this.plugin.settings.tagColors[tagName] = colorPicker.value;
					this.plugin.settings.useCustomColors = true;
					this.plugin.saveSettings();
					this.refresh();
				});

				// Trigger the color picker
				colorPicker.click();
			});

			for (const task of groupedTasks[tag]) {
				const taskEl = tasksContainer.createDiv({ 
					cls: `timeline-task timeline-task-${this.plugin.settings.cardSize}` 
				});
				
				if (task.isCompleted) {
					taskEl.addClass('timeline-task-completed');
				}
				
				// Task header with date and days left
				const taskHeader = taskEl.createDiv({ cls: 'timeline-task-header' });
				
				taskHeader.createDiv({ 
					cls: 'timeline-task-date', 
					text: this.formatDate(task.date) 
				});
				
				const daysLeft = task.daysLeft ?? Number.MAX_SAFE_INTEGER;
				taskHeader.createDiv({ 
					cls: `timeline-task-days-left ${
						task.isOverdue ? 'timeline-task-days-left-urgent' : 
						daysLeft <= 7 ? 'timeline-task-days-left-soon' : ''
					}`, 
					text: task.isOverdue ? 'Overdue' : // Display "Overdue" for overdue tasks
						daysLeft === 0 ? 'Today' : 
						daysLeft === 1 ? 'Tomorrow' : 
						`${daysLeft} days left` 
				});
				
				// Task content
				taskEl.createDiv({ cls: 'timeline-task-text', text: task.text });
				
				// Move file name to after the task content
				if (this.plugin.settings.showFileNames) {
					taskEl.createDiv({ cls: 'timeline-task-source', text: `From: ${task.fileName}` });
				}

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