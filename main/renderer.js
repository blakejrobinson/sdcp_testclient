const path = require('path');
const SDCP = require('sdcp');
const AddressBook = require('sdcp/SDCPAddressBook');
console.log(AddressBook);
const FileToUpload = path.join(__dirname, "test.ctb");

//Add the address book printers
AddressBook.Printers.forEach(Printer=>AddPrinter(Printer));

/**
 * Use discover to find all printers on the network
 * Add them to the address book and save it
 */
document.querySelector(".Discover").addEventListener("click", function (e)
{
	if (this.classList.contains("Discovering")) return;
	
	this.classList.add("Discovering");
	//Discover, timeout 500, callback per-device
	SDCP.SDCPDiscovery({Timeout: 5000, Callback: 
	
	//Each device
	device=>
	{
		if (AddressBook.Printers.find(Printer=>Printer.MainboardIP === device.MainboardIP)) return;
		AddressBook.Add(device);		
		AddPrinter(device);
	}

	//All done
	}, (err, devices) =>
	{
		//Save
		AddressBook.Save();
		this.classList.remove("Discovering");
	});
});

//Create a clone of a template
function cloneTemplate(templateId, data) 
{
	var template = document.querySelector(templateId);
	var clone = template.cloneNode(true);
	clone.classList.remove("Template");
	clone.SetName   = (Name)   => { clone.querySelector("span").textContent = Name; };
	clone.SetIP     = (IP)     => { clone.querySelector("span:nth-of-type(2)").textContent = IP; };
	clone.SetStatus = (Status, Sub) => { clone.querySelector("span:nth-of-type(3)").textContent = Status + (Sub ? " " + Sub : ""); clone.className = (Status + " Printer").trim(); };
	clone.SetImage  = (Image)  => { clone.querySelector("img").src = "printers/" + Image; };
	clone.SetNetwork= (Network)=> { clone.querySelector(".PrinterNetwork").className = Network + " PrinterNetwork"};

	if (data && data.Name)   clone.SetName(data.Name);
	if (data && data.IP)     clone.SetIP(data.IP);
	if (data && data.Status) clone.SetStatus(data.Status);
	if (data && data.Image)  clone.SetImage(data.Image);
	document.querySelector(".Printers").appendChild(clone);
	if (data && data.Status) 
		clone.classList.add(data.Status);

	return clone;
}

/** Add a printer to the page
 * @param {SDCP.SDCPPrinter} Printer - The printer to add
 * The printer will be set to autoreconnect and automatically connect. Status will be shown, etc.
 */
async function AddPrinter(Printer)
{
	console.log(Printer);
	var PrinterDIV = cloneTemplate(".Template.Printer", {Name: Printer.Name, IP: Printer.MainboardIP, Status: "Unknown", Image: ((Printer.BrandName||"")+Printer.MachineName).replace(/ /g,"") + ".png"});
	PrinterDIV.SetNetwork("Disconnected");

	//Open up the files dialog (must be V3.0.0)
	PrinterDIV.querySelector(".Tools .PrinterFiles").addEventListener("click", () =>
	{
		if (Printer.ProtocolVersion !== "V3.0.0") return;

		//Already open? Close
		if (document.querySelector(".Files").classList.contains("Open"))
		{
			document.querySelector(".Files").classList.remove("Open");
			return
		}

		//Else open it
		else
		{
			//By default get root
			document.querySelector(".Files .List").innerHTML = "";
			GetFiles(Printer, "").catch(err=>
			{
				document.querySelector(".Files").classList.remove("Open");
			});
		}
	});

	//Camera option (must be V3.0.0)
	PrinterDIV.querySelector(".Tools .PrinterCamera").addEventListener("click", async () =>
	{
		if (Printer.ProtocolVersion !== "V3.0.0") return;
		PrinterDIV.querySelector(".Tools .PrinterCamera").classList.add("Loading");

		//Enable the camera
		console.log(`Enabling camera`);
		var Camera = await Printer.SetVideoStream(true);

		//Update display
		document.querySelector(".Camera").classList.add("Open");
		document.querySelector(".Camera").classList.add("Loading");
		const CachedVideoUrl = `rtsp://${Printer.MainboardIP}:554/video`;
		console.log(`Getting ffmpeg -y -i ${Camera} -vframes 5 -`);

		//Grab a single picture
		const child_process = require('child_process');
		child_process.execFile('ffmpeg', ['-y', '-i', CachedVideoUrl, '-vframes', '5', '-f', 'mjpeg', '-'], { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) =>
		{
			//Errored
			if (error) 
			{
				document.querySelector(".Camera").classList.remove("Open");
				PrinterDIV.querySelector(".Tools .PrinterCamera").classList.remove("Loading");
				return console.log(error);
			}

			//Else show the image
			console.log(`    Image grabbed (${stdout.length} bytes)`);
			
			//stdout to base64 image
			document.querySelector(".Camera").classList.remove("Loading");
			document.querySelector(".Camera img").src = "data:image/jpeg;base64," + stdout.toString('base64');				
			PrinterDIV.querySelector(".Tools .PrinterCamera").classList.remove("Loading");
		});

	});	

	//Set up drag and drop for file upload (can be done on V1.0.0 but only implemented in V3.0.0 so far)
	function SetupDragDrop(div)
	{
		// Prevent default behavior for drag events
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			div.addEventListener(eventName,
				function preventDefaults(e)
				{									
					e.preventDefault();
					e.stopPropagation();
				}, false);
		});

		div.addEventListener("dragenter", function preventDefaults(e)
		{										
			this.draggedOver = (this.draggedOver || 0) + 1;
			this.classList.add("DragDrop");
		}, false);
		div.addEventListener("dragleave", function preventDefaults(e)
		{
			this.draggedOver = (this.draggedOver || 0) - 1;			
			if (this.draggedOver <= 0)
				this.classList.remove("DragDrop");
		}, false);

		div.addEventListener('drop', function handleDrop(e)
		{
			this.draggedOver = 0;
			this.classList.remove("DragDrop");

			let files = e.dataTransfer.files;
			if (files.length > 0)
			{
				let file = files[0];
				console.log(`Dropped ${file.name} (${file.size} bytes)`);
				//Must be a .CTB or .GOO file
				if (!file.name.match(/\.ctb$/i) && !file.name.match(/\.goo$/i))
				{
					console.log(`    Not a .CTB or .GOO file`);
					return;
				}

				TransferFile(PrinterDIV, Printer, file.path);				
			}

		}, false);
	}
	//if (Printer.ProtocolVersion === "V3.0.0") 
		SetupDragDrop(PrinterDIV);

	//Update status (broadcast for quick one)
	console.log(`Asking printer ${Printer.Name} at ${Printer.MainboardIP} for status`);
	var Status = await Printer.Broadcast();
	console.log(`    ` + JSON.stringify(Status, undefined, "\t").replace(/\n/g, "\n    "));
	if (Status.Status)
	switch(Status.Status.CurrentStatus)
	{
		case SDCP.Constants.SDCP_MACHINE_STATUS.IDLE:
			PrinterDIV.SetStatus("Idling");
			break;
		case SDCP.Constants.SDCP_MACHINE_STATUS.PRINTING:
			PrinterDIV.SetStatus("Printing");
			break;
		default:
			PrinterDIV.SetStatus(`Unknown ${Status.Status.CurrentStatus}`);
	}

	//Now tap into the printer things
	Printer.on("disconnect", () => {PrinterDIV.SetNetwork("Disconnected");});
	Printer.on("connected",    () => {PrinterDIV.SetNetwork("Connected");});
	Printer.on("reconnected",    () => {PrinterDIV.SetNetwork("Reconnected");});

	//Connect to it
	Printer.AutoReconnect = true;
	Printer.Connect().then(async () =>
	{
		console.log(`Connected to printer ${Printer.Name} at ${Printer.MainboardIP}`);
		//V3.0.0 should force a status and attributes request manually
		if (Printer.ProtocolVersion === "V3.0.0")
		{
			Printer.SendCommand(new SDCP.SDCPCommand.SDCPCommandStatus());
			Printer.SendCommand(new SDCP.SDCPCommand.SDCPCommandAttributes());
		}

		//Attributes updates
		Printer.on("attributes", async (Attributes) =>console.log(Attributes));

		//Status updates
		Printer.on("status", async (Status) =>
		{
			//Status
			console.log({Machine: Printer.MainboardIP, ...Status});
			switch(Status.CurrentStatus[0])
			{
				case SDCP.Constants.SDCP_MACHINE_STATUS.IDLE:
					PrinterDIV.SetStatus("Idling");
					break;
				case SDCP.Constants.SDCP_MACHINE_STATUS.PRINTING:	

					if (Status.PrintInfo && Status.PrintInfo.TotalLayer)
					{
						let PrintAmount = parseInt(Status.PrintInfo.CurrentLayer / Status.PrintInfo.TotalLayer * 100);
						PrinterDIV.querySelector(".Printer .Printed").style.width = PrintAmount + "%";								
						PrinterDIV.querySelector(".Printer .Printed").title = PrintAmount + "% printed " + Status.PrintInfo.Filename;
					}
					else
						PrinterDIV.querySelector(".Printer .Printing").style.width = undefined;

					PrinterDIV.SetStatus("Printing", Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.FILE_CHECKING  ? "(Checking)" 
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.COMPLETE 		? "(Complete)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.DROPPING 		? "(Dropping)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.EXPOSURING 	? "(Exposing)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.HOMING 		? "(Homing)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.LIFTING 		? "(Lifting)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.PAUSED 		? "(Paused)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.PAUSING 		? "(Pausing)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.STOPPED 		? "(Stopped)"
												   : Status.PrintInfo.Status === SDCP.Constants.SDCP_PRINT_STATUS.STOPPING 		? "(Stopping)"
												   : undefined);
					break;
				case SDCP.Constants.SDCP_MACHINE_STATUS.FILE_TRANSFERRING:
					PrinterDIV.SetStatus("Uploading");
					/*if (Status.FileTransferInfo && Status.FileTransferInfo.FileTotalSize)
					{
						let UploadedAmount = parseInt(Status.FileTransferInfo.DownloadOffset / Status.FileTransferInfo.FileTotalSize * 100);
						PrinterDIV.querySelector(".Uploaded").style.width = UploadedAmount + "%";
					}*/
					break;					
				default:
					PrinterDIV.SetStatus(`Unknown (${Status.CurrentStatus[0]})`);
			}
		});
	}).catch((err) =>
	{
		console.log(err);
	});	
}

//Go back a directory in the file browser
document.querySelector(".Files .Header i.Back").addEventListener("click", function (e)
{
	if (!this.Printer) return;

	var path = this.Path.split("/");
	if (path.length) path.pop();
	this.Path = path.join("/");

	console.log("Go to " + (this.Path || ""));
	GetFiles(this.Printer, (this.Path || ""));
});
//Close file browser
document.querySelector(".Files .Header i.Close").addEventListener("click", function (e)
{
	document.querySelector(".Files").classList.remove("Open");
});

//Close the capture
document.querySelector(".Camera").addEventListener("click", function (e)
{
	this.classList.remove('Open');
});

//Get a list of files from a printer and display
async function GetFiles(Printer, path)
{
	document.querySelector(".Files .Header span").textContent = path || "/";
	if (path === "")	document.querySelector(".Files .Header i").classList.add("root");
	else				document.querySelector(".Files .Header i").classList.remove("root");
	document.querySelector(".Files .Header i").Printer = Printer;
	document.querySelector(".Files .Header i").Path = path;


	document.querySelector(".Files").classList.add("Open");
	document.querySelector(".Files").classList.add("Loading");
	var files = await Printer.GetFiles(path);
	document.querySelector(".Files").classList.remove("Loading");
	console.log(files);	
	document.querySelector(".Files .List").innerHTML = "";
	files.forEach(file =>
	{
		var Entry = document.createElement("li");
		Entry.className = "Item";
		Entry.fullPath = file.name;
		Entry.filetype = file.type;
		Entry.innerHTML = `<i class="fa-solid fa-${file.type === 0 ? "folder" : "file"}"></i><span>${file.name.split("/").reverse()[0]}</span>${file.type === 1 ? `<i class="fa-solid fa-print"></i>`:``}${path !== "" ? `<i class="fa-solid fa-trash"></i>`:``}`;
		Entry.title = file.name;

		//Click it to go into the folder
		Entry.addEventListener("click", () =>
		{
			console.log(`Getting ${Entry.fullPath}`);
			if (file.type === 0)
				GetFiles(Printer, Entry.fullPath);
		});	
		//Click trash (twice) to delete it
		if (Entry.querySelector(".fa-trash"))
			Entry.querySelector(".fa-trash").addEventListener("click", function(e)
			{
				e.stopPropagation();
				if (!Entry.classList.contains("Confirm"))
				{
					Entry.classList.add("Confirm");
					return;
				}
				Entry.classList.remove("Confirm");
				console.log(`Deleting ${Entry.fullPath}`);
				document.querySelector(".Files").classList.add("Loading");
				Printer.DeleteFilesFolders(Entry.filetype === 0 ? [Entry.fullPath] : [], Entry.filetype === 1 ? [Entry.fullPath] : [], ).then(()=>
				{
					document.querySelector(".Files").classList.remove("Loading");
					Entry.parentElement.removeChild(Entry);
				}).catch(err=>
				{
					console.error(err);
				});
			});
		//Click print to print it
		if (Entry.querySelector(".fa-print"))
			Entry.querySelector(".fa-print").addEventListener("click", function(e)
			{
				e.stopPropagation();
				Printer.Start(Entry.fullPath);
				Document.querySelector(".Files").classList.remove("Open");
			});		

		//Add this entry
		document.querySelector(".Files .List").appendChild(Entry);
	});
}

/** Send a file to the printer */
async function TransferFile(PrinterDIV, Printer, File, Callback)
{
	try
	{	
		//Upload the file
		console.log(`Uploading ${File}`);
		PrinterDIV.querySelector(".Uploaded").style.width = undefined;
		var result = await Printer.UploadFile(File, 
		{
			
			//Progress update
			ProgressCallback: 
			(progress)=>
			{
				console.log(progress);
				let UploadedAmount = parseInt(progress.Offset / progress.TotalSize * 100);
				PrinterDIV.querySelector(".Uploaded").style.width = UploadedAmount + "%";
			}});

		//All done
		console.log(result);
		if (typeof Callback === "function") 
			Callback(result);
		if (Printer.ProtocolVersion === "V3.0.0")
			GetFiles(Printer, "/local");
	}
	catch(err)
	{
		setTimeout(()=>document.querySelector(".Files").classList.remove("Open"), 1500);
		console.error(err);
	}
}