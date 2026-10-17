export type Id = string;

export type ClassRow = {
  id: Id;
  name: string;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  format: string | null;
};

export type Period = { n: number; start: string; end: string };

export type Student = {
  id: Id;
  name: string;
  phone: string | null;
  email: string | null;
  emergency: string | null;
  status: string | null;
  plan: string | null;
  plan_amount: number | null;
  plan_months: number | null;
  paid_through: string | null;
  pays_by: string | null;
  is_trade: boolean | null;
  trade_role: string | null;
  trade_value: number | null;
  tags: string[] | null;
  notes: string | null;
  welcome_sent: string | null;
  quest_sent: string | null;
  extras_sent: string | null;
  tuition_sent: string | null;
  agreement_sent: string | null;
  /** Present only if the optional students.start_date column has been added. */
  start_date?: string | null;
};

export type Enrollment = { student_id: Id; class_id: Id; rate: number | null };

export type Week = "Worked" | "Present" | "Absent" | "Canceled" | "";

export type Rec = {
  period: number;
  class_id: Id;
  student_id: Id;
  week1: string | null;
  week2: string | null;
  week3: string | null;
  week4: string | null;
  tuition_due: number | null;
  paid_by: string | null;
  amount_paid: number | null;
  paid_date: string | null;
  trade_value: number | null;
  notes: string | null;
};

export type PlanPay = { period: number; student_id: Id; amount: number | null; method: string | null; paid_date: string | null };

export type Scene = {
  id: Id;
  class_id: Id;
  date: string;
  actors: string | null;
  actor_ids: Id[] | null;
  actor_other: string | null;
  scene: string | null;
  work: number | null;
  complete: boolean | null;
  alternate: boolean | null;
  cancelled: boolean | null;
  picked_up_by: string | null;
  notes: string | null;
};

export type Inquiry = {
  id: Id;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  label: string | null;
  notes: string | null;
  created: string | null;
};
