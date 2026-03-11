import { useState } from "react";

export interface UsePaginationResult<T> {
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  currentItems: T[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setItemsPerPage: (size: number) => void;
  totalItems: number;
}

export function usePagination<T>(
  items: T[],
  initialPageSize: number = 10,
): UsePaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPageState] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Ensure current page is valid when items or page size changes
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages);
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = items.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    const pageNumber = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(pageNumber);
  };

  const nextPage = () => {
    goToPage(currentPage + 1);
  };

  const prevPage = () => {
    goToPage(currentPage - 1);
  };

  const setItemsPerPage = (size: number) => {
    setItemsPerPageState(size);
    setCurrentPage(1); // Reset to first page on size change to avoid empty views
  };

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    currentItems,
    goToPage,
    nextPage,
    prevPage,
    setItemsPerPage,
    totalItems,
  };
}
