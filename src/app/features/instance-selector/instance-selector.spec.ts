import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InstanceSelector } from './instance-selector';

describe('InstanceSelector', () => {
  let component: InstanceSelector;
  let fixture: ComponentFixture<InstanceSelector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InstanceSelector]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InstanceSelector);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
