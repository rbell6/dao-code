import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

/** The Dao wordmark shared with the web client. */
export function DaoWordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 114 / 58;
  return (
    <Svg
      accessibilityLabel="Dao"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="7 35 114 58"
    >
      <ThemedPath
        d="M45.92 63.4Q45.92 76.84 40.28 84.24Q34.64 91.64 23.68 91.64H9.52V35h14.24q10.88 0 16.52 7.48t5.64 20.92Zm-9.6 0q0-5.04-.92-8.8t-2.6-6.24q-1.68-2.48-4-3.72t-5.04-1.24H19.2v39.84h4.56q2.72 0 5.04-1.24t4-3.72q1.68-2.48 2.6-6.2t.92-8.68Zm34.96 9.12h-2.64q-1.68 0-3.24.28t-2.76 1.08q-1.2.8-1.92 2.2T60 79.64q0 3.2 1.4 4.72t3.24 1.52q1.84 0 3.12-1.04t2.04-2.64q.76-1.6 1.12-3.56t.36-3.8v-2.32Zm.32 13.04q-.88 3.36-3.2 5.24t-6.16 1.88q-1.76 0-3.6-.64t-3.32-2.12q-1.48-1.48-2.44-3.84t-.96-5.72q0-4.32 1.56-7.08t4-4.36q2.44-1.6 5.44-2.2t5.88-.6h2.24v-1.28q0-4.08-1.64-5.88t-4.36-1.8q-2.32 0-4.2 1.08t-3.24 2.84l-4.32-5.68q2.24-2.8 5.68-4.36t6.8-1.56q3.76 0 6.36 1.2t4.2 3.48q1.6 2.28 2.28 5.64t.68 7.6v24.24h-7.52v-6.08Zm46.88-14.24q0 4.8-1.08 8.8t-3.12 6.84q-2.04 2.84-4.92 4.44T102.8 93q-3.68 0-6.56-1.6t-4.92-4.44q-2.04-2.84-3.12-6.84t-1.08-8.8q0-4.88 1.08-8.92t3.08-6.92q2-2.88 4.92-4.44t6.6-1.56q3.68 0 6.56 1.56t4.92 4.44q2.04 2.88 3.12 6.92t1.08 8.92Zm-8.96-.08q0-2.96-.4-5.48t-1.24-4.4q-.84-1.88-2.08-2.96t-3-1.08q-1.76 0-3 1.08t-2.04 2.96q-.8 1.88-1.2 4.4t-.4 5.48q0 2.88.4 5.44t1.2 4.4q.8 1.84 2.04 2.92t3 1.08q1.76 0 3.04-1.08t2.08-2.92q.8-1.84 1.2-4.4t.4-5.44Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
