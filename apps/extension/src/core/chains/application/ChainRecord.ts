export type ChainGroupId = string;
export type ChainId = string;

export type ChainRecord<TSettings extends object = object> = {
	chainGroupId: ChainGroupId;
	id: ChainId;
	name: string;
	settings: TSettings;
};
