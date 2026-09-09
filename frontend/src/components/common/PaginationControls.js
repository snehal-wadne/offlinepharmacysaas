import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

export default function PaginationControls({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
  isMobile = false,
  isLoading = false,
}) {
  if (totalItems <= 0) return null;

  const startIdx = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  // Generate visible page numbers (e.g. 1, 2, 3, 4, 5)
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = isMobile ? 3 : 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      {/* Showing X - Y of Z entries */}
      <View style={styles.infoRow}>
        <Text style={styles.infoText}>
          Showing <Text style={styles.boldText}>{startIdx}–{endIdx}</Text> of{' '}
          <Text style={styles.boldText}>{totalItems}</Text> items
        </Text>

        {isLoading && (
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingText}>Loading page...</Text>
          </View>
        )}
      </View>

      {/* Right / Bottom Controls: Page Size & Nav Buttons */}
      <View style={[styles.controlsRow, isMobile && styles.controlsRowMobile]}>
        {/* Page Size Selector */}
        {onPageSizeChange && (
          <View style={styles.pageSizeWrapper}>
            <Text style={styles.pageSizeLabel}>Rows:</Text>
            {pageSizeOptions.map((sz) => (
              <Pressable
                key={sz}
                onPress={() => onPageSizeChange(sz)}
                style={[
                  styles.pageSizeBtn,
                  pageSize === sz && styles.pageSizeBtnActive,
                ]}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.pageSizeText,
                    pageSize === sz && styles.pageSizeTextActive,
                  ]}
                >
                  {sz}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Previous Button */}
        <Pressable
          onPress={() => onPageChange && onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          style={[
            styles.navBtn,
            (currentPage <= 1 || isLoading) && styles.navBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Previous Page"
        >
          <Text
            style={[
              styles.navBtnText,
              (currentPage <= 1 || isLoading) && styles.navBtnTextDisabled,
            ]}
          >
            ‹ Prev
          </Text>
        </Pressable>

        {/* Page Number Buttons */}
        <View style={styles.pagesList}>
          {pages[0] > 1 && (
            <>
              <Pressable
                onPress={() => onPageChange && onPageChange(1)}
                style={[styles.pageBtn, currentPage === 1 && styles.pageBtnActive]}
                disabled={isLoading}
              >
                <Text style={[styles.pageBtnText, currentPage === 1 && styles.pageBtnTextActive]}>
                  1
                </Text>
              </Pressable>
              {pages[0] > 2 && <Text style={styles.ellipsisText}>…</Text>}
            </>
          )}

          {pages.map((p) => (
            <Pressable
              key={p}
              onPress={() => onPageChange && onPageChange(p)}
              style={[
                styles.pageBtn,
                currentPage === p && styles.pageBtnActive,
              ]}
              disabled={isLoading}
            >
              <Text
                style={[
                  styles.pageBtnText,
                  currentPage === p && styles.pageBtnTextActive,
                ]}
              >
                {p}
              </Text>
            </Pressable>
          ))}

          {pages[pages.length - 1] < totalPages && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && (
                <Text style={styles.ellipsisText}>…</Text>
              )}
              <Pressable
                onPress={() => onPageChange && onPageChange(totalPages)}
                style={[
                  styles.pageBtn,
                  currentPage === totalPages && styles.pageBtnActive,
                ]}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.pageBtnText,
                    currentPage === totalPages && styles.pageBtnTextActive,
                  ]}
                >
                  {totalPages}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Next Button */}
        <Pressable
          onPress={() => onPageChange && onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          style={[
            styles.navBtn,
            (currentPage >= totalPages || isLoading) && styles.navBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Next Page"
        >
          <Text
            style={[
              styles.navBtnText,
              (currentPage >= totalPages || isLoading) && styles.navBtnTextDisabled,
            ]}
          >
            Next ›
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 12,
  },
  containerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    paddingHorizontal: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#64748B',
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  loadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  loadingText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F766E',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlsRowMobile: {
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  pageSizeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 6,
  },
  pageSizeLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginRight: 2,
  },
  pageSizeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  pageSizeBtnActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  pageSizeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  pageSizeTextActive: {
    color: '#FFFFFF',
  },
  navBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  navBtnDisabled: {
    opacity: 0.45,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  navBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  navBtnTextDisabled: {
    color: '#94A3B8',
  },
  pagesList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageBtn: {
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
  },
  pageBtnActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  pageBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  pageBtnTextActive: {
    color: '#FFFFFF',
  },
  ellipsisText: {
    fontSize: 14,
    color: '#94A3B8',
    paddingHorizontal: 2,
  },
});
