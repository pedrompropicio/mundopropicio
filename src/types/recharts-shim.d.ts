declare module "recharts" {
  import * as React from "react";

  export type TooltipProps<TValue = any, TName = any> = Record<string, any> & {
    active?: boolean;
    payload?: any[];
    label?: any;
    formatter?: (...args: any[]) => React.ReactNode;
    labelFormatter?: (...args: any[]) => React.ReactNode;
    content?: React.ReactNode | ((props: any) => React.ReactNode);
  };

  export type LegendProps = Record<string, any> & {
    payload?: any[];
    verticalAlign?: "top" | "middle" | "bottom";
  };

  export class ResponsiveContainer extends React.Component<any> {}
  export class BarChart extends React.Component<any> {}
  export class LineChart extends React.Component<any> {}
  export class AreaChart extends React.Component<any> {}
  export class PieChart extends React.Component<any> {}
  export class ComposedChart extends React.Component<any> {}
  export class XAxis extends React.Component<any> {}
  export class YAxis extends React.Component<any> {}
  export class CartesianGrid extends React.Component<any> {}
  export class Tooltip<TValue = any, TName = any> extends React.Component<TooltipProps<TValue, TName>> {}
  export class Legend extends React.Component<LegendProps> {}
  export class Bar extends React.Component<any> {}
  export class Line extends React.Component<any> {}
  export class Area extends React.Component<any> {}
  export class Pie extends React.Component<any> {}
  export class Cell extends React.Component<any> {}
  export class ReferenceLine extends React.Component<any> {}
}