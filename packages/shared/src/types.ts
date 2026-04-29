export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export interface Station {
  id: number;
  name: string;
  capacity: number;
  unlimited: boolean;
}

export interface Dish {
  id: number;
  name: string;
  station_id: number;
  cook_time_minutes: number;
}

export interface Order {
  id: number;
  placed_at: string;
  promise_time_minutes: number;
  cancelled_at?: string | null;
}

export interface CookTask {
  id: number;
  order_id: number;
  dish_id: number;
  status: TaskStatus;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface CookNextItem {
  task_id: number;
  slack_minutes: number;
}

export interface StationQueue {
  station_id: number;
  cook_next: CookNextItem[];
  in_progress: number[];
  pending_count: number;
}

export interface ActiveOrderTask extends CookTask {
  dish_name: string;
  station_id: number;
  /** Projected minutes from now until this task finishes. Absent if the task is done/cancelled. */
  projected_minutes_from_now?: number;
  /** True if this task's projected finish exceeds the order's promise time. */
  projected_late?: boolean;
}

export interface ActiveOrderView {
  order: Order;
  tasks: ActiveOrderTask[];
}

export interface QueueUpdateMessage {
  type: "queue_update";
  payload: {
    queues: StationQueue[];
    orders: ActiveOrderView[];
  };
}

export type ServerToClientMessage = QueueUpdateMessage;
