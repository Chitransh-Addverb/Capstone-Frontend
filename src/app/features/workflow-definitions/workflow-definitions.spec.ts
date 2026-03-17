import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowDefinitionsComponent } from './workflow-definitions';

describe('WorkflowDefinitionsComponent', () => {
  let component: WorkflowDefinitionsComponent;
  let fixture: ComponentFixture<WorkflowDefinitionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowDefinitionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowDefinitionsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

