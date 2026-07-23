import { Children, useRef, type ReactNode } from "react";
import { View } from "react-native";
import PagerView from "react-native-pager-view";

import { SegmentedControl, type SegmentOption } from "./SegmentedControl";

export interface SwipeTabsProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * One page per option, in the same order as `options`. Each page fills the
   * pager and manages its own scrolling — the pager itself takes the remaining
   * height, so place `<SwipeTabs>` inside a non-scroll `<Screen>`.
   */
  children: ReactNode;
  /** Extra classes for the segmented control (e.g. bottom margin). */
  tabsClassName?: string;
}

/**
 * A segmented control wired to a horizontally-swipeable PagerView: tapping a
 * segment pages to it, swiping between pages moves the segment. The two stay in
 * sync from either direction. Pages stay mounted (PagerView keeps them alive),
 * so each tab keeps its own scroll position and query state.
 */
export function SwipeTabs<T extends string>({
  options,
  value,
  onChange,
  children,
  tabsClassName,
}: SwipeTabsProps<T>) {
  const pagerRef = useRef<PagerView>(null);
  const pages = Children.toArray(children);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <>
      <SegmentedControl
        options={options}
        value={value}
        onChange={(next) => {
          const i = options.findIndex((o) => o.value === next);
          if (i >= 0) pagerRef.current?.setPage(i);
          onChange(next);
        }}
        className={tabsClassName}
      />
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={index}
        onPageSelected={(e) => {
          const opt = options[e.nativeEvent.position];
          // Guard against the echo from our own setPage() call.
          if (opt && opt.value !== value) onChange(opt.value);
        }}
      >
        {pages.map((page, i) => (
          <View key={options[i]?.value ?? i} style={{ flex: 1 }} collapsable={false}>
            {page}
          </View>
        ))}
      </PagerView>
    </>
  );
}
