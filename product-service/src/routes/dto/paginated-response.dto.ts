/** `meta` sibling of the list envelope — `page` is 1-based, shared by every service. */
export interface PaginationMetaDto {
  page: number;
  pageSize: number;
  total: number;
}

export class PaginatedResponseDto<T> {
  items: T[];
  meta: PaginationMetaDto;

  constructor(items: T[], total: number, page: number, pageSize: number) {
    this.items = items;
    this.meta = { page, pageSize, total };
  }
}
