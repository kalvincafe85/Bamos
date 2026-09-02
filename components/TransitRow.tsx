import type { TransitBlock } from "@/lib/schema";
import { toDisplayTime } from "@/lib/time";
import Icon from "./Icon";

const MODE_ICON: Record<TransitBlock["mode"], string> = {
  car: "directions_car",
  walk: "directions_walk",
  transit: "directions_bus",
  scooter: "two_wheeler",
  bicycle: "directions_bike",
};

export default function TransitRow({
  block,
  editable = false,
  onTimeClick,
}: {
  block: TransitBlock;
  editable?: boolean;
  onTimeClick?: () => void;
}) {
  const TimeTag = editable ? "button" : "span";
  const timeClass = `font-medium text-neutral-700 ${editable ? "underline decoration-dotted underline-offset-2" : ""}`;

  return (
    <div className="ml-5 flex items-center gap-2 border-l-2 border-dashed border-neutral-200 py-2 pl-5 text-xs text-neutral-500">
      <TimeTag className={timeClass} onClick={onTimeClick}>
        {toDisplayTime(block.departure)}
      </TimeTag>
      <span>{block.from}</span>
      <Icon name={MODE_ICON[block.mode]} className="text-base text-neutral-400" />
      <span>{block.minutes} mins</span>
      <span>➜</span>
      <TimeTag className={timeClass} onClick={onTimeClick}>
        {toDisplayTime(block.arrival)}
      </TimeTag>
      <span>{block.to}</span>
    </div>
  );
}
