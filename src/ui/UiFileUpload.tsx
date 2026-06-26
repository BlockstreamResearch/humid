import { Delete02Icon, File01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, useEffect, useId, useState } from "react";
import { useDropzone } from "react-dropzone";

import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";
import { UiCard, UiCardContent } from "@/ui/UiCard";

import { UiLabel } from "./UiLabel";

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round(bytes / Math.pow(k, i)) + sizes[i];
}

function buildAcceptObject(acceptedFileTypes?: string[]) {
	if (!acceptedFileTypes || acceptedFileTypes.length === 0) {
		return undefined;
	}

	const acceptObject: Record<string, string[]> = {};
	const extensions: string[] = [];

	acceptedFileTypes.forEach((type) => {
		if (type.startsWith(".")) {
			// Collect extensions to map to their MIME types
			extensions.push(type);
		} else {
			// Already a MIME type
			acceptObject[type] = [];
		}
	});

	// Map common extensions to MIME types
	if (extensions.length > 0) {
		const extensionToMime: Record<string, string> = {
			".png": "image/png",
			".jpg": "image/jpeg",
			".jpeg": "image/jpeg",
			".gif": "image/gif",
			".webp": "image/webp",
			".svg": "image/svg+xml",
			".txt": "text/plain",
			".log": "text/plain",
			".pdf": "application/pdf",
			".doc": "application/msword",
			".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			".xls": "application/vnd.ms-excel",
			".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		};

		extensions.forEach((ext) => {
			const mimeType = extensionToMime[ext.toLowerCase()];
			if (mimeType) {
				if (!acceptObject[mimeType]) {
					acceptObject[mimeType] = [];
				}
				acceptObject[mimeType].push(ext);
			}
		});
	}

	return Object.keys(acceptObject).length > 0 ? acceptObject : undefined;
}

function formatAcceptedTypes(acceptedFileTypes?: string[]): string {
	if (!acceptedFileTypes || acceptedFileTypes.length === 0) {
		return "All file types are allowed to upload.";
	}

	const formatted = acceptedFileTypes
		.map((type) => {
			if (type.startsWith(".")) {
				return type.toUpperCase();
			}
			if (type.includes("/*")) {
				return type.split("/")[0].charAt(0).toUpperCase() + type.split("/")[0].slice(1);
			}
			return type;
		})
		.join(", ");

	return `Accepted file types: ${formatted}`;
}

/**
 * File upload component with drag & drop support, file type and size validation
 *
 * @example
 * // Allow all file types with default 50MB limit
 * <UiFileUpload files={files} onFilesChange={setFiles} />
 *
 * @example
 * // Accept only images with custom max size
 * <UiFileUpload
 *   files={files}
 *   onFilesChange={setFiles}
 *   acceptedFileTypes={['image/*']}
 *   maxFileSize={10 * 1024 * 1024} // 10MB
 * />
 *
 * @example
 * // Accept specific image formats
 * <UiFileUpload
 *   files={files}
 *   onFilesChange={setFiles}
 *   acceptedFileTypes={['.png', '.jpg', '.jpeg', '.gif']}
 * />
 *
 * @example
 * // Accept PDFs and Word documents
 * <UiFileUpload
 *   files={files}
 *   onFilesChange={setFiles}
 *   acceptedFileTypes={['application/pdf', '.doc', '.docx']}
 * />
 *
 * @example
 * // Mix of MIME types and extensions
 * <UiFileUpload
 *   files={files}
 *   onFilesChange={setFiles}
 *   acceptedFileTypes={['image/*', 'application/pdf', '.txt']}
 *   maxFileSize={100 * 1024 * 1024} // 100MB
 * />
 *
 * @example
 * // Disabled state
 * <UiFileUpload
 *   files={files}
 *   onFilesChange={setFiles}
 *   disabled={true}
 * />
 */
export default function UiFileUpload({
	files,
	onFilesChange,
	disabled,
	className,
	maxFileSize = 10 * 1024 * 1024,
	acceptedFileTypes,
}: {
	files: File[];
	onFilesChange: (v: File[]) => void;

	disabled?: boolean;
	maxFileSize?: number;
	acceptedFileTypes?: string[];
} & Omit<ComponentProps<"div">, "children">) {
	const id = useId();
	const [errors, setErrors] = useState<string[]>([]);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: (acceptedFiles) => {
			setErrors([]);
			onFilesChange(acceptedFiles);
		},
		onDropRejected: (fileRejections) => {
			const newErrors = fileRejections.map((rejection) => {
				const errorMessages = rejection.errors
					.map((err) => {
						if (err.code === "file-too-large") {
							return `${rejection.file.name} is too large (max ${formatFileSize(maxFileSize)})`;
						}
						if (err.code === "file-invalid-type") {
							return `${rejection.file.name} is not an accepted file type`;
						}
						return err.message;
					})
					.join(", ");
				return errorMessages;
			});
			setErrors(newErrors);
		},
		disabled: disabled,
		maxSize: maxFileSize,
		accept: buildAcceptObject(acceptedFileTypes),
	});

	const filesList = files.map((file) => (
		<FilesListItem
			key={file.name}
			file={file}
			files={files}
			onFilesChange={onFilesChange}
			disabled={disabled}
		/>
	));

	return (
		<div className={cn("col-span-full w-full", className)}>
			<UiLabel htmlFor={`file-upload-${id}`} className="font-medium">
				File(s) Upload
			</UiLabel>
			<div
				{...getRootProps()}
				id="ui-file-upload-dropzone"
				className={cn(
					isDragActive ? "border-primary bg-primary/10 ring-primary/20 ring-2" : "border-border",
					"mt-2 flex justify-center rounded-md border border-dashed px-6 py-20 transition-colors duration-200",
				)}
			>
				<div>
					<HugeiconsIcon
						icon={File01Icon}
						className="text-muted-foreground/80 mx-auto h-12 w-12"
						aria-hidden={true}
					/>
					<div className="text-muted-foreground mt-4 flex text-sm">
						<p>Drag and drop or</p>
						<label
							htmlFor="file"
							className="text-primary hover:text-primary/80 relative cursor-pointer rounded-sm pl-1 font-medium hover:underline hover:underline-offset-4"
						>
							<span>choose file(s)</span>
							<input
								{...getInputProps()}
								id={`file-upload-${id}`}
								name={`file-upload-${id}`}
								type="file"
								className="sr-only"
							/>
						</label>
						<p className="pl-1">to upload</p>
					</div>
				</div>
			</div>
			<p className="text-muted-foreground mt-2 text-sm leading-5 sm:flex sm:items-center sm:justify-between">
				<span>{formatAcceptedTypes(acceptedFileTypes)}</span>
				<span className="pl-1 sm:pl-0">Max. size per file: {formatFileSize(maxFileSize)}</span>
			</p>
			{errors.length > 0 && (
				<div className="mt-2 space-y-1">
					{errors.map((error, index) => (
						<p key={index} className="text-destructive text-sm">
							{error}
						</p>
					))}
				</div>
			)}
			{filesList.length > 0 && (
				<>
					<h4 className="text-foreground mt-6 font-medium">File(s) to Upload</h4>
					<ul role="list" className="mt-4 space-y-4">
						{filesList}
					</ul>
				</>
			)}
		</div>
	);
}

function FilesListItem({
	file,

	files,
	onFilesChange,
	disabled,

	className,
	...rest
}: {
	file: File;
	files: File[];
	disabled?: boolean;
	onFilesChange: (v: File[]) => void;
} & ComponentProps<"li">) {
	const isImage = file.type.startsWith("image/");
	const imageUrl = isImage ? URL.createObjectURL(file) : null;

	useEffect(() => {
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		};
	}, [imageUrl]);

	return (
		<li {...rest} className={cn("relative", className)}>
			<UiCard className="relative p-4">
				<div className="absolute top-1/2 right-4 -translate-y-1/2">
					<UiButton
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Remove file"
						onClick={() => {
							const newFiles = files.filter((el) => el.name !== file.name);
							onFilesChange(newFiles);
						}}
						disabled={disabled}
					>
						<HugeiconsIcon icon={Delete02Icon} className="h-5 w-5" aria-hidden={true} />
					</UiButton>
				</div>
				<UiCardContent className="flex items-center space-x-3 p-0">
					<span className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
						{isImage && imageUrl ? (
							<img
								src={imageUrl}
								alt={file.name}
								className="h-full w-full rounded-md object-cover"
							/>
						) : (
							<HugeiconsIcon
								icon={File01Icon}
								className="text-foreground h-5 w-5"
								aria-hidden={true}
							/>
						)}
					</span>
					<div>
						<p className="text-foreground font-medium">{file.name}</p>
						<p className="text-muted-foreground mt-0.5 text-sm">{formatFileSize(file.size)}</p>
					</div>
				</UiCardContent>
			</UiCard>
		</li>
	);
}
