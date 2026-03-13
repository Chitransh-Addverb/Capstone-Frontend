import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowDesignerComponent } from './workflow-designer';

describe('WorkflowDesignerComponent', () => {
  let component: WorkflowDesignerComponent;
  let fixture: ComponentFixture<WorkflowDesignerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowDesignerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowDesignerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

