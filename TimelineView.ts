import { ItemView, TFile, WorkspaceLeaf, Modal } from 'obsidian';
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
	isOverdue?: boolean;
	position: { 
		start: { line: number, col: number, offset: number },
		end: { line: number, col: number, offset: number }
	};
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
					const isOverdue = daysLeft < 0;
					
					// Calculate position information
					const matchStart = match.index;
					const matchEnd = matchStart + match[0].length;
					
					// Calculate line and column positions
					let line = 0;
					let lastNewLine = -1;
					for (let i = 0; i < matchStart; i++) {
						if (content[i] === '\n') {
							line++;
							lastNewLine = i;
						}
					}
					const col = matchStart - lastNewLine - 1;
					
					this.tasks.push({
						text,
						date,
						tag,
						filePath: file.path,
						fileName: file.basename,
						daysLeft,
						isCompleted,
						isOverdue,
						position: {
							start: { line, col, offset: matchStart },
							end: { line, col: col + match[0].length, offset: matchEnd }
						}
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

		// Choose rendering method based on view mode
		if (this.plugin.settings.viewMode === 'calendar') {
			this.renderCalendarView(container as HTMLElement);
		} else {
			this.renderTimelineView(container as HTMLElement);
		}
	}

	renderTimelineView(container: HTMLElement) {
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
					text: task.isOverdue ? 'Overdue' : 
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
						this.app.workspace.getLeaf().openFile(file, {
							eState: {
								line: task.position.start.line,
								focus: true
							}
						});
					}
				});
			}
		}
	}

	renderCalendarView(container: HTMLElement) {
		const calendarContainer = container.createDiv({ cls: 'calendar-container' });
		
		// Group tasks by date
		const tasksByDate: Record<string, TimelineTask[]> = {};
		const dateSet = new Set<string>();
		
		for (const task of this.tasks) {
			const dateKey = this.formatDateKey(task.date);
			if (!tasksByDate[dateKey]) tasksByDate[dateKey] = [];
			tasksByDate[dateKey].push(task);
			dateSet.add(dateKey);
		}
		
		// Find the month range
		const dates = Array.from(dateSet).map(d => this.parseDateKey(d)).sort((a, b) => a.getTime() - b.getTime());
		if (dates.length === 0) {
			calendarContainer.createEl('div', { text: 'No tasks found for any dates.' });
			return;
		}
		
		const firstDate = dates[0];
		const lastDate = dates[dates.length - 1];
		
		// Generate months between first and last date
		const months = this.getMonthsBetween(firstDate, lastDate);
		
		// Controls for the calendar
		const controlsContainer = calendarContainer.createDiv({ cls: 'calendar-controls' });
		controlsContainer.createEl('button', {
			text: 'Today',
			cls: 'calendar-today-button',
		}).addEventListener('click', () => {
			// Find today's month view and scroll to it
			const today = new Date();
			const monthKey = `${today.getFullYear()}-${today.getMonth()}`;
			const monthElement = calendarContainer.querySelector(`[data-month-key="${monthKey}"]`);
			if (monthElement) {
				monthElement.scrollIntoView({ behavior: 'smooth' });
			}
		});
		
		// Render each month
		for (const month of months) {
			this.renderMonth(calendarContainer, month, tasksByDate);
		}
	}

	private formatDateKey(date: Date): string {
		return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	}

	private parseDateKey(dateKey: string): Date {
		const [year, month, day] = dateKey.split('-').map(n => parseInt(n, 10));
		return new Date(year, month, day);
	}

	private getMonthsBetween(startDate: Date, endDate: Date): {year: number, month: number}[] {
		const months: {year: number, month: number}[] = [];
		const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
		
		while (currentDate <= endDate) {
			months.push({
				year: currentDate.getFullYear(),
				month: currentDate.getMonth()
			});
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
		
		return months;
	}

	private renderMonth(container: HTMLElement, month: {year: number, month: number}, tasksByDate: Record<string, TimelineTask[]>) {
		const monthContainer = container.createDiv({
			cls: 'calendar-month',
			attr: {
				'data-month-key': `${month.year}-${month.month}`
			}
		});
		
		const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
							 'July', 'August', 'September', 'October', 'November', 'December'];
							 
		// Month header
		monthContainer.createEl('h3', {
			text: `${monthNames[month.month]} ${month.year}`,
			cls: 'calendar-month-header'
		});
		
		// Create the grid for days
		const calendarGrid = monthContainer.createDiv({ cls: 'calendar-grid' });
		
		// Day headers (Sun, Mon, etc)
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		for (const dayName of dayNames) {
			calendarGrid.createDiv({ 
				cls: 'calendar-day-header',
				text: dayName
			});
		}
		
		// Get the first day of the month and the total days in month
		const firstDay = new Date(month.year, month.month, 1);
		const lastDay = new Date(month.year, month.month + 1, 0);
		const daysInMonth = lastDay.getDate();
		
		// Add empty cells for days before the start of the month
		for (let i = 0; i < firstDay.getDay(); i++) {
			calendarGrid.createDiv({ cls: 'calendar-day calendar-day-empty' });
		}
		
		// Add days of the month
		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(month.year, month.month, day);
			const dateKey = this.formatDateKey(date);
			const tasksForDay = tasksByDate[dateKey] || [];
			
			const dayCell = calendarGrid.createDiv({
				cls: `calendar-day ${tasksForDay.length > 0 ? 'calendar-day-has-tasks' : ''}`,
			});
			
			// Day number
			dayCell.createDiv({
				cls: 'calendar-day-number',
				text: day.toString()
			});
			
			// If there are tasks, show them
			if (tasksForDay.length > 0) {
				const dayTasksContainer = dayCell.createDiv({ cls: 'calendar-day-tasks' });
				
				for (const task of tasksForDay.slice(0, 3)) { // Show up to 3 tasks
					const taskEl = dayTasksContainer.createDiv({ cls: 'calendar-task' });
					
					if (task.isCompleted) {
						taskEl.addClass('calendar-task-completed');
					}
					
					taskEl.createDiv({
						cls: 'calendar-task-text',
						text: task.text
					});
					
					taskEl.addEventListener('click', (e) => {
						e.stopPropagation(); // Prevent the day cell click from triggering
						const file = this.app.vault.getAbstractFileByPath(task.filePath);
						if (file instanceof TFile) {
							this.app.workspace.getLeaf().openFile(file, {
								eState: {
									line: task.position.start.line,
									focus: true
								}
							});
						}
					});
				}
				
				// If there are more tasks than we're showing
				if (tasksForDay.length > 3) {
					dayTasksContainer.createDiv({
						cls: 'calendar-more-tasks',
						text: `+${tasksForDay.length - 3} more`
					}).addEventListener('click', (e) => {
						// Show a modal with all tasks for this day
						e.stopPropagation(); // Prevent the day cell click from triggering
						this.showTasksForDay(date, tasksForDay);
					});
				}
				
				// Add click event to the entire day cell to show all tasks
				dayCell.addEventListener('click', () => {
					this.showTasksForDay(date, tasksForDay);
				});
			}
			
			// Mark today
			const today = new Date();
			if (day === today.getDate() && 
				month.month === today.getMonth() && 
				month.year === today.getFullYear()) {
				dayCell.addClass('calendar-day-today');
			}
		}
		
		// Fill in remaining cells
		const lastDayOfWeek = lastDay.getDay();
		for (let i = lastDayOfWeek + 1; i <= 6; i++) {
			calendarGrid.createDiv({ cls: 'calendar-day calendar-day-empty' });
		}
	}

	private showTasksForDay(date: Date, tasks: TimelineTask[]) {
		const modal = new Modal(this.app);
		const { contentEl } = modal;

		contentEl.createEl("h2", { text: `Tasks for ${this.formatDate(date)}` });
		
		const taskListEl = contentEl.createDiv({ cls: "calendar-modal-task-list" });
		
		for (const task of tasks) {
			const taskEl = taskListEl.createDiv({ cls: "calendar-modal-task" });
			
			if (task.isCompleted) {
				taskEl.addClass("calendar-modal-task-completed");
			}
			
			taskEl.createDiv({ 
				cls: "calendar-modal-task-text",
				text: task.text
			});
			
			// Add tag pill
			const tagEl = taskEl.createDiv({ 
				cls: "calendar-modal-task-tag",
				text: task.tag
			});
			tagEl.style.backgroundColor = this.getTagColor(task.tag);
			
			if (this.plugin.settings.showFileNames) {
				taskEl.createDiv({ 
					cls: "calendar-modal-task-source",
					text: `From: ${task.fileName}`
				});
			}
			
			taskEl.addEventListener("click", () => {
				const file = this.app.vault.getAbstractFileByPath(task.filePath);
				if (file instanceof TFile) {
					modal.close();
					this.app.workspace.getLeaf().openFile(file, {
						eState: {
							line: task.position.start.line,
							focus: true
						}
					});
				}
			});
		}
		
		modal.open();
	}

	formatDate(date: Date): string {
		const day = date.getDate().toString().padStart(2, '0');
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const month = months[date.getMonth()];
		const year = date.getFullYear();
		return `${day}-${month}-${year}`;
	}
}