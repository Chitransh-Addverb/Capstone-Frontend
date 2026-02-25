import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Instances } from './instances';

describe('Instances', () => {
  let component: Instances;
  let fixture: ComponentFixture<Instances>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Instances]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Instances);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
