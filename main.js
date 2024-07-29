const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const SDCP = require("sdcp");

const createWindow = () => 
{
	const win = new BrowserWindow(
	{
		width: 800,
		height: 600,
		webPreferences: 
		{
			contextIsolation: false,
            nodeIntegration: true			
		}
	});

	win.loadFile('main/index.html');
	mainWindow.setMenu(null);
}

app.whenReady().then(() => 
{
	// Menu.setApplicationMenu(null);
	createWindow();

	app.on('activate', () => 
	{
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	});
});

app.on('window-all-closed', () => 
{
	if (process.platform !== 'darwin') 
		app.quit();
});