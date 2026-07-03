"use client";

import {
	type ColumnDef,
	flexRender,
	type TableOptions,
	useReactTable,
} from "@tanstack/react-table";

import {
	UiTable,
	UiTableBody,
	UiTableCell,
	UiTableHead,
	UiTableHeader,
	UiTableRow,
} from "@/ui/UiTable";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
}

function DataTable<TData, TValue>({
	columns,
	data,

	tableOptions,
}: {
	tableOptions: Omit<TableOptions<TData>, "data" | "columns">;
} & DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,

		...tableOptions,
	});

	return (
		<div className="overflow-hidden rounded-md border">
			<UiTable>
				<UiTableHeader className="bg-[#F9FAFD]">
					{table.getHeaderGroups().map((headerGroup) => (
						<UiTableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								return (
									<UiTableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</UiTableHead>
								);
							})}
						</UiTableRow>
					))}
				</UiTableHeader>
				<UiTableBody>
					{table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map((row) => (
							<UiTableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
								{row.getVisibleCells().map((cell) => (
									<UiTableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</UiTableCell>
								))}
							</UiTableRow>
						))
					) : (
						<UiTableRow>
							<UiTableCell colSpan={columns.length} className="h-24 text-center">
								No results.
							</UiTableCell>
						</UiTableRow>
					)}
				</UiTableBody>
			</UiTable>
		</div>
	);
}

export { DataTable as UiDataTable };
