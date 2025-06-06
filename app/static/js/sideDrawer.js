function initSideDrawer() {
    const drawer = document.getElementById('side-drawer');
    const toggleDrawerBtn = document.getElementById('toggle-drawer-btn');
    const drawerCloseBtn = document.querySelector('#side-drawer .close-btn');

    if (!drawer || !toggleDrawerBtn || !drawerCloseBtn) {
        console.warn("Side drawer elements not found, skipping initialization.");
        return;
    }

    toggleDrawerBtn.addEventListener('click', () => {
        if (drawer.classList.contains('open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    });

    drawerCloseBtn.addEventListener('click', closeDrawer);
    
//     console.log("SideDrawer initialized.");
}

function openDrawer() {
    const drawer = document.getElementById('side-drawer');
    if (drawer && !drawer.classList.contains('open')) {
        drawer.classList.add('open');
        document.body.classList.add('drawer-open');
    }
}

function closeDrawer() {
    const drawer = document.getElementById('side-drawer');
    if (drawer && drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        document.body.classList.remove('drawer-open');
    }
}

// Expose if needed, but init pattern is better
window.sideDrawerManager = {
    initSideDrawer,
    openDrawer,
    closeDrawer
};
