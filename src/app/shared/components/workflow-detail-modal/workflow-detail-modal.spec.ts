import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowDetailModal } from './workflow-detail-modal';

describe('WorkflowDetailModal', () => {
  let component: WorkflowDetailModal;
  let fixture: ComponentFixture<WorkflowDetailModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowDetailModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowDetailModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
