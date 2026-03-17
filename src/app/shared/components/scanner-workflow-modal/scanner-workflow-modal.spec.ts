import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScannerWorkflowModal } from './scanner-workflow-modal';

describe('ScannerWorkflowModal', () => {
  let component: ScannerWorkflowModal;
  let fixture: ComponentFixture<ScannerWorkflowModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScannerWorkflowModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScannerWorkflowModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
