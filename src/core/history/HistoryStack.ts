/** Reversible edit; implementations retain only changed fields/subtrees. */
export interface HistoryCommand {
  label: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
}

/** Bounded command history. Pushing an already executed edit discards the redo branch. */
export class HistoryStack {
  private past: HistoryCommand[] = [];
  private future: HistoryCommand[] = [];

  /** @param capacity Maximum retained commands, at least twenty. */
  constructor(private readonly capacity = 50) {
    if (!Number.isSafeInteger(capacity) || capacity < 20) throw new Error('历史容量至少为 20');
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get undoLabel(): string {
    return this.past[this.past.length - 1]?.label ?? '';
  }
  get redoLabel(): string {
    return this.future[this.future.length - 1]?.label ?? '';
  }

  /** @param command Edit that has already executed successfully. @returns Nothing. */
  push(command: HistoryCommand): void {
    this.past.push(command);
    if (this.past.length > this.capacity) this.past.shift();
    this.future = [];
  }
  /** @returns Whether an edit was undone. */
  undo(): boolean {
    const command = this.past[this.past.length - 1];
    if (!command) return false;
    command.undo();
    this.past.pop();
    this.future.push(command);
    return true;
  }
  /** @returns Whether an edit was redone. */
  redo(): boolean {
    const command = this.future[this.future.length - 1];
    if (!command) return false;
    command.redo();
    this.future.pop();
    this.past.push(command);
    return true;
  }
  /** @returns Nothing. */
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
