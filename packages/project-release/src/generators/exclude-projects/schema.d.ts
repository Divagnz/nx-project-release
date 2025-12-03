export interface ExcludeProjectsSchema {
  projects?: string[];
  add?: boolean;
  remove?: boolean;
  interactive?: boolean;
  pattern?: string;
}
