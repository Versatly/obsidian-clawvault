/**
 * Canvas Template Picker Modal
 * Allows users to select a template and runtime options
 */

import { App, Modal, Setting } from "obsidian";
import {
	CANVAS_TEMPLATE_IDS,
	type CanvasTemplateId,
} from "../constants";
import { BUILTIN_CANVAS_TEMPLATES } from "../canvas-templates";

export interface TemplateModalResult {
	templateId: CanvasTemplateId;
	projectFilter: string;
	dateRangeDays: number;
}

export class TemplateModal extends Modal {
	private templateId: CanvasTemplateId = CANVAS_TEMPLATE_IDS.PROJECT_BOARD;
	private projectFilter = "";
	private dateRangeDays = 7;
	private onSubmit: (result: TemplateModalResult) => Promise<void> | void;

	constructor(
		app: App,
		onSubmit: (result: TemplateModalResult) => Promise<void> | void
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("clawvault-template-modal");

		contentEl.createEl("h2", { text: "Generate canvas from template" });

		new Setting(contentEl)
			.setName("Template")
			.setDesc("Choose a built-in ClawVault canvas template")
			.addDropdown((dropdown) => {
				for (const template of BUILTIN_CANVAS_TEMPLATES) {
					dropdown.addOption(template.id, template.title);
				}
				dropdown.setValue(this.templateId);
				dropdown.onChange((value) => {
					this.templateId = value as CanvasTemplateId;
					this.renderTemplateDescription();
				});
			});

		this.renderTemplateDescription();

		new Setting(contentEl)
			.setName("Project filter")
			.setDesc("Optional project name filter (used by project board)")
			.addText((text) =>
				text
					.setPlaceholder("All projects")
					.setValue(this.projectFilter)
					.onChange((value) => {
						this.projectFilter = value;
					})
			);

		new Setting(contentEl)
			.setName("Date range (days)")
			.setDesc("Used by sprint dashboard for recent decisions")
			.addSlider((slider) =>
				slider
					.setLimits(1, 30, 1)
					.setDynamicTooltip()
					.setValue(this.dateRangeDays)
					.onChange((value) => {
						this.dateRangeDays = value;
					})
			);

		const actionsEl = contentEl.createDiv({ cls: "clawvault-modal-buttons" });
		const cancelBtn = actionsEl.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const generateBtn = actionsEl.createEl("button", {
			text: "Generate canvas",
			cls: "mod-cta",
		});
		generateBtn.addEventListener("click", () => {
			void this.handleSubmit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderTemplateDescription(): void {
		const existing = this.contentEl.querySelector(".clawvault-template-description");
		if (existing) {
			existing.remove();
		}

		const selectedTemplate = BUILTIN_CANVAS_TEMPLATES.find(
			(template) => template.id === this.templateId
		);
		const description = this.contentEl.createDiv({
			cls: "clawvault-template-description",
		});
		description.setText(
			selectedTemplate?.description ?? "Template description unavailable."
		);
	}

	private async handleSubmit(): Promise<void> {
		await this.onSubmit({
			templateId: this.templateId,
			projectFilter: this.projectFilter.trim(),
			dateRangeDays: this.dateRangeDays,
		});
		this.close();
	}
}
