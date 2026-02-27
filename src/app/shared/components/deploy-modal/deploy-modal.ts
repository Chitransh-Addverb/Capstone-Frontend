import {
  Component, EventEmitter, Input, Output,
  OnChanges, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DeployFormData {
  workflow_key: string;
  description: string;
}

@Component({
  selector: 'app-deploy-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deploy-modal.html',
  styleUrl: './deploy-modal.scss',
})
export class DeployModal implements OnChanges {
  @Input() visible = false;
  @Input() bpmn_xml = '';

  // If editing existing — pass these in
  @Input() editMode = false;
  @Input() existingKey = '';
  @Input() existingDescription = '';
  @Input() nextVersion = 1;

  @Output() deploy = new EventEmitter<DeployFormData>();
  @Output() cancel = new EventEmitter<void>();

  form: DeployFormData = { workflow_key: '', description: '' };
  keyError = signal('');
  deploying = signal(false);

  private readonly KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

  ngOnChanges(): void {
    if (this.visible) {
      this.form = {
        workflow_key: this.editMode ? this.existingKey : '',
        description: this.editMode ? this.existingDescription : '',
      };
      this.keyError.set('');
      this.deploying.set(false);
    }
  }

  onKeyChange(value: string): void {
    this.form.workflow_key = value;
    this.validateKey(value);
  }

  validateKey(value: string): boolean {
    if (!value.trim()) {
      this.keyError.set('Workflow key is required');
      return false;
    }
    if (!this.KEY_PATTERN.test(value)) {
      this.keyError.set('Only letters, numbers, hyphens and underscores allowed');
      return false;
    }
    this.keyError.set('');
    return true;
  }

  isValid(): boolean {
    return (
      this.form.workflow_key.trim().length > 0 &&
      this.KEY_PATTERN.test(this.form.workflow_key) &&
      this.bpmn_xml.length > 0
    );
  }

  onDeploy(): void {
    if (!this.isValid()) return;
    this.deploying.set(true);
    this.deploy.emit({ ...this.form });
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.cancel.emit();
    }
  }

  resetDeploying(): void {
    this.deploying.set(false);
  }
}




