// Creates and updates maps (mini-map and main)
define(['ash',
	'utils/CanvasUtils',
	'utils/MapUtils',
	'game/GameGlobals',
	'game/constants/ColorConstants',
	'game/constants/UIConstants',
	'game/constants/CanvasConstants',
	'game/constants/ExplorationConstants',
	'game/constants/ItemConstants',
	'game/constants/MovementConstants',
	'game/constants/PositionConstants',
	'game/constants/SectorConstants',
	'game/nodes/PlayerPositionNode',
	'game/components/type/LevelComponent',
	'game/components/common/CampComponent',
	'game/components/common/PositionComponent',
	'game/components/player/ItemsComponent',
	'game/components/sector/SectorStatusComponent',
	'game/components/sector/SectorLocalesComponent',
	'game/components/sector/SectorFeaturesComponent',
	'game/components/sector/PassagesComponent',
	'game/components/sector/improvements/SectorImprovementsComponent',
	'game/components/sector/improvements/WorkshopComponent',
	'game/components/type/SectorComponent',
	'game/vos/PositionVO'],
function (Ash, CanvasUtils, MapUtils,
	GameGlobals, ColorConstants, UIConstants, CanvasConstants, ExplorationConstants, ItemConstants, MovementConstants, PositionConstants, SectorConstants,
	PlayerPositionNode,
	LevelComponent, CampComponent, PositionComponent, ItemsComponent,
	SectorStatusComponent, SectorLocalesComponent, SectorFeaturesComponent, PassagesComponent, SectorImprovementsComponent, WorkshopComponent, SectorComponent,
	PositionVO) {

	var UIMapHelper = Ash.Class.extend({

		playerPosNodes: null,

		icons: [],

		isMapRevealed: false,

		constructor: function (engine) {
			this.playerPosNodes = engine.getNodeList(PlayerPositionNode);
			this.isMapRevealed = false;

			this.initIcon("camp", "map-camp");
			this.initIcon("campable", "map-campable");
			this.initIcon("passage-up", "map-passage-up");
			this.initIcon("passage-up-disabled", "map-passage-up-disabled");
			this.initIcon("passage-down", "map-passage-down");
			this.initIcon("passage-down-disabled", "map-passage-down-disabled");
			this.initIcon("interest", "map-interest");
			this.initIcon("unknown", "map-unvisited");
			this.initIcon("workshop", "map-workshop");
			this.initIcon("water", "map-water");
			this.initIcon("beacon", "map-beacon");
			this.initIcon("ingredient", "map-ingredient");
		},

		initIcon: function(key, name) {
			this.icons[key] = new Image();
			this.icons[key].src = "img/" + name + ".png";
			this.icons[key + "-sunlit"] = new Image();
			this.icons[key + "-sunlit"].src = "img/" + name + "-sunlit.png";
		},

		enableScrollingForMap: function (canvasId) {
			CanvasConstants.makeCanvasScrollable(canvasId);
			CanvasConstants.updateScrollEnable(canvasId);
		},

		disableScrollingForMap: function (canvasId) {
			// TODO check if this works
			$("#" + canvasId).off("mousedown", this.onScrollableMapMouseDown);
			$("#" + canvasId).off("mouseup", this.onScrollableMapMouseUp);
			$("#" + canvasId).off("mouseleave", this.onScrollableMapMouseLeave);
			$("#" + canvasId).off("mousemove", this.onScrollableMapMouseMove);
			$("#" + canvasId).removeClass("scrollable");
			$("#" + canvasId).parent().unwrap();
		},

		centerMapToPlayer: function (canvasId, mapPosition, centered) {
			var sectorSize = this.getSectorSize(false);
			var mapDimensions = this.getMapSectorDimensions(canvasId, -1, false, mapPosition);
			var minVisibleX = mapDimensions.minVisibleX;
			var minVisibleY = mapDimensions.minVisibleY;
			var playerPosX = sectorSize + (mapPosition.sectorX - minVisibleX) * sectorSize * (1 + this.getSectorPadding(centered));
			var playerPosY = sectorSize + (mapPosition.sectorY - minVisibleY) * sectorSize * (1 + this.getSectorPadding(centered));
			$("#" + canvasId).parent().scrollLeft(playerPosX - $("#" + canvasId).parent().width() * 0.5);
			$("#" + canvasId).parent().scrollTop(playerPosY - $("#" + canvasId).parent().height() * 0.5);
			CanvasConstants.snapScrollPositionToGrid(canvasId);
			CanvasConstants.updateScrollIndicators(canvasId);
		},

		rebuildMap: function (canvasId, overlayId, mapPosition, mapSize, centered, mapMode, sectorSelectedCallback) {
			let map = {};
			map.canvasID = canvasId;
			
			log.i("rebuild map with mode: " + mapMode);
			
			let canvases = $("#" + canvasId);
			let canvas = canvases[0];
			let ctx = CanvasUtils.getCTX(canvases);

			let visibleSectors = {};
			let allSectors = {};
			let mapDimensions = this.getMapSectorDimensions(canvasId, mapSize, centered, mapPosition, visibleSectors, allSectors);
				
			if (ctx) {
				this.rebuildMapWithCanvas(mapPosition, canvas, ctx, centered, visibleSectors, allSectors, mapDimensions);
			}

			if (overlayId) {
				this.rebuildOverlay(map, mapPosition, overlayId, centered, visibleSectors, mapDimensions, sectorSelectedCallback);
			}
			
			return map;
		},
		
		setSelectedSector: function (map, sector) {
			var sectorPos = sector == null ? null : sector.get(PositionComponent).getPosition();
			$.each($(".map-overlay-cell"), function () {
				var level = $(this).attr("data-level");
				var x = $(this).attr("data-x");
				var y = $(this).attr("data-y");
				var isMatch = sectorPos && sectorPos.level == level && sectorPos.sectorX == x && sectorPos.sectorY == y;
				if (isMatch == null) isMatch = false;
				$(this).toggleClass("selected", isMatch);
			});
		},
		
		getASCII: function (mapPosition) {
			let result = "";
			
			let level = mapPosition.level;
			let levelComponent = GameGlobals.levelHelper.getLevelEntityForPosition(level).get(LevelComponent);
			
			result += "\n";
			
			for (var y = levelComponent.minY - 1; y <= levelComponent.maxY + 1; y++) {
				let levelResult = "";
				for (var x = levelComponent.minX - 1; x <= levelComponent.maxX + 1; x++) {
					let sector = GameGlobals.levelHelper.getSectorByPosition(mapPosition.level, x, y);
					
					levelResult += this.getSectorASCII(sector);
				}
				if (levelResult.trim().length > 0) {
					levelResult += "\n";
					result += levelResult;
				}
			}
			
			return result;
		},
		
		getSectorASCII: function (sector) {
			if (sector == null) return " ";
			
			let sectorStatus = SectorConstants.getSectorStatus(sector);
			
			if (sectorStatus == null) return " ";
			if (sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_INVISIBLE) return " ";
			if (sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE) return "?";
			
			if (sector.has(CampComponent)) return "C";
			
			if (sectorStatus == SectorConstants.MAP_SECTOR_STATUS_VISITED_UNSCOUTED) return "0";
			if (sectorStatus == SectorConstants.MAP_SECTOR_STATUS_REVEALED_BY_MAP) return "0";
			
			var sectorPassages = sector.get(PassagesComponent);
			if (sectorPassages.passageUp) return "U";
			if (sectorPassages.passageDown) return "D";
			
			let statusComponent = sector.get(SectorStatusComponent);
			let localesComponent = sector.get(SectorLocalesComponent);
			let unScoutedLocales = localesComponent.locales.length - statusComponent.getNumLocalesScouted();
			
			if (unScoutedLocales > 0) return "!";
			
			if (sectorStatus == SectorConstants.MAP_SECTOR_STATUS_VISITED_SCOUTED) return "0";
			if (sectorStatus == SectorConstants.MAP_SECTOR_STATUS_VISITED_CLEARED) return "X";
					
			return "?";
		},
		
		getASCIILegend: function () {
			return "? = unvisited, 0 = visited, X = cleared, C = camp, U = passage up, D = passage down, ! = point of interest";
		},

		rebuildMapWithCanvas: function (mapPosition, canvas, ctx, centered, visibleSectors, allSectors, dimensions) {
			let sectorSize = this.getSectorSize(centered);
			let sunlit = $("body").hasClass("sunlit");
			let level = mapPosition.level;
			let levelEntity = GameGlobals.levelHelper.getLevelEntityForPosition(level);
			
			// background color
			let colorBgMap = this.getBackgroundColor(level, sunlit);
			ctx.canvas.width = dimensions.canvasWidth;
			ctx.canvas.height = dimensions.canvasHeight;
			ctx.clearRect(0, 0, canvas.scrollWidth, canvas.scrollWidth);
			ctx.fillStyle = colorBgMap;
			ctx.fillRect(0, 0, canvas.scrollWidth, canvas.scrollHeight);

			var sector;
			var sectorXpx;
			var sectorYpx;
			var sectorPos;
			var sectorPadding = this.getSectorPadding(centered);
			
			this.drawGridOnCanvas(ctx, sectorSize, dimensions, centered);
			// this.drawVisibleAreaOnCanvas(ctx, mapPosition, centered, dimensions, visibleSectors, sunlit, true);
			this.drawDistrictsOnCanvas(ctx, mapPosition, centered, dimensions, visibleSectors, allSectors, sunlit);
			
			// borders on beacons
			ctx.strokeStyle = ColorConstants.getColor(sunlit, "map_stroke_sector_lit");
			ctx.lineWidth = centered ? 4 : 2;
			let beaconSectors = GameGlobals.levelHelper.getAllSectorsWithImprovement(mapPosition.level, improvementNames.beacon);
			for (let i = 0; i < beaconSectors.length; i++) {
				sector = beaconSectors[i];
				let sectorStatus = SectorConstants.getSectorStatus(sector);
				sectorPos = sector.get(PositionComponent);
				if (this.showSectorOnMap(centered, sector, sectorStatus)) {
					sectorXpx = this.getSectorPixelPos(dimensions, centered, sectorSize, sectorPos.sectorX, sectorPos.sectorY).x;
					sectorYpx = this.getSectorPixelPos(dimensions, centered, sectorSize, sectorPos.sectorX, sectorPos.sectorY).y;
					ctx.beginPath();
					ctx.arc(sectorXpx + sectorSize * 0.5, sectorYpx + 0.5 * sectorSize, sectorSize * (ExplorationConstants.BEACON_RADIUS - 1) * 2, 0, 2 * Math.PI);
					ctx.stroke();
				}
			}

			// sectors connecting paths
			this.foreachVisibleSector(mapPosition.level, centered, dimensions, visibleSectors, (sector, sectorPos, sectorStatus, sectorXpx, sectorYpx) => {
				if (SectorConstants.isLBasicInfoVisible(sectorStatus)) {
					this.drawMovementLinesOnCanvas(ctx, mapPosition, sector, sectorPos, sectorXpx, sectorYpx, sectorSize, sectorPadding);
				}
			});

			// sectors
			this.foreachVisibleSector(mapPosition.level, centered, dimensions, visibleSectors, (sector, sectorPos, sectorStatus, sectorXpx, sectorYpx) => {
				this.drawSectorOnCanvas(ctx, sectorPos.x, sectorPos.y, sector, levelEntity, sectorStatus, sectorXpx, sectorYpx, sectorSize);
			});

			// border on current
			var playerPosVO = this.playerPosNodes.head.position.getPosition();
			if (playerPosVO.level == mapPosition.level) {
				sectorXpx = this.getSectorPixelPos(dimensions, centered, sectorSize, playerPosVO.sectorX, playerPosVO.sectorY).x;
				sectorYpx = this.getSectorPixelPos(dimensions, centered, sectorSize, playerPosVO.sectorX, playerPosVO.sectorY).y;
				ctx.strokeStyle = ColorConstants.getColor(sunlit, "border_highlight");
				ctx.lineWidth = centered ? 3 : 2;
				ctx.beginPath();
				ctx.arc(sectorXpx + sectorSize * 0.5, sectorYpx + 0.5 * sectorSize, sectorSize, 0, 2 * Math.PI);
				ctx.stroke();
			}

			CanvasConstants.updateScrollEnable($(canvas).attr("id"));
		},

		rebuildOverlay: function (map, mapPosition, overlayId, centered, visibleSectors, dimensions, sectorSelectedCallback) {
			var $overlay = $("#" + overlayId);
			$overlay.empty();
			$overlay.css("width", dimensions.canvasWidth + "px");
			$overlay.css("height", dimensions.canvasHeight + "px");
			
			map.overlay = {};

			var sectorSize = this.getSectorSize(centered);

			var sector;
			var sectorStatus;
			var sectorXpx;
			var sectorYpx;
			var sectorPos;
			for (var y = dimensions.minVisibleY; y <= dimensions.maxVisibleY; y++) {
				for (var x = dimensions.minVisibleX; x <= dimensions.maxVisibleX; x++) {
					sector = visibleSectors[x + "." + y];
					sectorStatus = SectorConstants.getSectorStatus(sector);
					if (this.showSectorOnMap(centered, sector, sectorStatus)) {
						sectorXpx = this.getSectorPixelPos(dimensions, centered, sectorSize, x, y).x;
						sectorYpx = this.getSectorPixelPos(dimensions, centered, sectorSize, x, y).y;
						sectorPos = new PositionVO(mapPosition.level, x, y);
						var data = "data-level='" + sectorPos.level + "' data-x='" + sectorPos.sectorX + "' data-y='" + sectorPos.sectorY + "'";
						var $div = $("<div class='canvas-overlay-cell map-overlay-cell' style='top: " + sectorYpx + "px; left: " + sectorXpx + "px' " + data +"></div>");
						if (sectorSelectedCallback) {
							$div.click(function (e) {
								$.each($(".map-overlay-cell"), function () {
									$(this).toggleClass("selected", false);
								});
								var $target = $(e.target);
								var level = $target.attr("data-level");
								var x = $target.attr("data-x");
								var y = $target.attr("data-y");
								$target.toggleClass("selected", true);
								sectorSelectedCallback(level, x, y);
							});
						}
						$overlay.append($div);
					}
				}
			}
		},

		getSectorPixelPos: function (dimensions, centered, sectorSize, x, y) {
			var smallMapOffsetX = Math.max(0, (dimensions.canvasWidth - dimensions.mapWidth) / 2);
			var padding = this.getSectorPadding(centered);
			var margin = this.getSectorMargin(centered);
			return {
				x: Math.round((sectorSize * margin + sectorSize * padding + (x - dimensions.minVisibleX) * sectorSize * (1 + padding) + smallMapOffsetX) * 10)/10,
				y: Math.round((sectorSize * margin + sectorSize * padding + (y - dimensions.minVisibleY) * sectorSize * (1 + padding)) * 10)/10
			};
		},
		
		getSectorPixelPosCenter: function (dimensions, centered, sectorSize, x, y) {
			let cornerPos = this.getSectorPixelPos(dimensions, centered, sectorSize, x, y);
			return {
				x: cornerPos.x + sectorSize / 2,
				y: cornerPos.y + sectorSize / 2
			};
		},

		drawVisibleAreaOnCanvas: function (ctx, mapPosition, centered, dimensions, visibleSectors, sunlit, stroke) {
			let sectorSize = this.getSectorSize(centered);
			let level = mapPosition.level;
			let colorBgMap = this.getBackgroundColor(level, sunlit);
			
			let colorBorderVisibleArea = this.getVisibleAreaBackgroundColor(level, sunlit);
			let radiusDefault = 2;
			let radiusSmall = 0.75;
			let paddingDefault = 2.3;
			let paddingSmall = 0.4;
			
			ctx.lineWidth = 2;
			
			this.foreachVisibleSector(level, centered, dimensions, visibleSectors, (sector, sectorPos, sectorStatus, sectorXpx, sectorYpx) => {
				let bgPadding = sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE ? sectorSize * paddingSmall : sectorSize * paddingDefault;
				let radius = sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE ? sectorSize * radiusSmall : sectorSize * radiusDefault;
				ctx.fillStyle = colorBorderVisibleArea;
				ctx.strokeStyle = colorBorderVisibleArea;
				CanvasUtils.fillRoundedRect(ctx, sectorXpx - bgPadding, sectorYpx - bgPadding, sectorSize + bgPadding * 2, sectorSize + bgPadding * 2, radius);
			});
			
			if (stroke) {
				let borderSize = 3;
				this.foreachVisibleSector(level, centered, dimensions, visibleSectors, (sector, sectorPos, sectorStatus, sectorXpx, sectorYpx) => {
					let bgPadding = sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE ? sectorSize * paddingSmall : sectorSize * paddingDefault;
					let radius = sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE ? sectorSize * radiusSmall : sectorSize * radiusDefault;
					let sectorFeatures = sector.get(SectorFeaturesComponent);
					ctx.fillStyle = sectorFeatures.isEarlyZone() ? colorBgMap : "#252525";
					ctx.strokeStyle = sectorFeatures.isEarlyZone() ? colorBgMap : "#252525";
					CanvasUtils.fillRoundedRect(ctx, sectorXpx - bgPadding + borderSize, sectorYpx - bgPadding + borderSize, sectorSize + bgPadding * 2 - borderSize * 2, sectorSize + bgPadding * 2 - borderSize * 2, radius);
				});
			}
		},

		drawGridOnCanvas: function (ctx, sectorSize, dimensions, centered) {
			var gridSize = this.getGridSize();
			var sunlit = $("body").hasClass("sunlit");
			ctx.strokeStyle = ColorConstants.getColor(sunlit, "map_stroke_grid");
			ctx.lineWidth = 2;
			var sectorPadding = this.getSectorPadding(centered);
			var startGridX = (Math.floor(dimensions.mapMinX / gridSize) - 1) * gridSize;
			var endGridX = (Math.ceil(dimensions.mapMaxX / gridSize) + 2) * gridSize;
			var startGridY = (Math.floor(dimensions.mapMinY / gridSize) - 1) * gridSize;
			var endGridY = (Math.ceil(dimensions.mapMaxY / gridSize) + 1) * gridSize;
			for (var y = startGridY; y <= endGridY; y += gridSize) {
				for (var x = startGridX; x <= endGridX; x += gridSize) {
					var gridX = x - (gridSize - 1 / 2);
					var gridY = y - (gridSize - 1 / 2);
					ctx.strokeRect(
						this.getSectorPixelPos(dimensions, centered, sectorSize, gridX, gridY).x - sectorSize * 0.5 + 2,
						this.getSectorPixelPos(dimensions, centered, sectorSize, gridX, gridY).y - sectorSize * 0.5 + 2,
						(sectorSize + sectorSize * sectorPadding) * gridSize,
						(sectorSize + sectorSize * sectorPadding) * gridSize);
				}
			}
		},

		drawDistrictsOnCanvas: function (ctx, mapPosition, centered, dimensions, visibleSectors, allSectors, sunlit) {
			let sectorSize = this.getSectorSize(centered);
			let level = mapPosition.level;
			
			let radiusDefault = 3.15;
			let radiusSmall = 0.75;
			
			let paddingDefault = 2.25;
			let paddingSmall = 0.53;
			let paddingSmallDiagonal = 0.65;
			let paddingBig = 4.25;
			
			ctx.fillStyle = this.getVisibleAreaBackgroundColor(level, sunlit);
			ctx.strokeStyle = this.getVisibleAreaBackgroundColor(level, sunlit);
			this.foreachVisibleSector(mapPosition.level, centered, dimensions, visibleSectors, (sector, sectorPos, sectorStatus, sectorXpx, sectorYpx) => {
				let sectorFeatures = sector.get(SectorFeaturesComponent);
				if (!sectorFeatures.isEarlyZone()) return;
				
				let neighbours = GameGlobals.levelHelper.getSectorNeighboursMap(sector);

				let isVisibleEdge = sectorStatus == SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE;
				let hasDifferentZoneNeighbour = false;
				let hasNonDiagonalNeighbour = false;
				
				for (let direction in neighbours) {
					let neighbour = neighbours[direction];
					if (!neighbour) continue;
					
					let neighbourFeatures = neighbour.get(SectorFeaturesComponent);
					if (neighbourFeatures.isEarlyZone() != sectorFeatures.isEarlyZone()) {
						hasDifferentZoneNeighbour = true;
					}
					if (!PositionConstants.isDiagonal(direction)) {
						hasNonDiagonalNeighbour = true;
					}
				}
				
				let isSingle = isVisibleEdge || hasDifferentZoneNeighbour;
				
				let bgPadding = sectorSize * (isSingle ? (hasNonDiagonalNeighbour ? paddingSmall : paddingSmallDiagonal) : paddingDefault);
				let radius = sectorSize * (isSingle ? radiusSmall : radiusDefault);
				
				ctx.save();
				ctx.translate(sectorXpx + sectorSize / 2, sectorYpx + sectorSize / 2);
				if (!hasNonDiagonalNeighbour && !isSingle) {
					ctx.rotate(Math.PI / 4);
				}
				
				CanvasUtils.fillRoundedRect(ctx, - sectorSize / 2 - bgPadding, -sectorSize / 2 - bgPadding, sectorSize + bgPadding * 2, sectorSize + bgPadding * 2, radius);
				
				ctx.restore();
			});
		},

		drawSectorOnCanvas: function (ctx, x, y, sector, levelEntity, sectorStatus, sectorXpx, sectorYpx, sectorSize) {
			var isLocationSunlit = $("body").hasClass("sunlit");
			var isBigSectorSize = sectorSize >= this.getSectorSize(true);

			let statusComponent = sector.get(SectorStatusComponent);
			let sectorFeatures = sector.get(SectorFeaturesComponent);
			let sectorPassages = sector.get(PassagesComponent);
			
			let itemsComponent = this.playerPosNodes.head.entity.get(ItemsComponent);
			
			let isScouted = statusComponent.scouted;
			let isRevealed = isScouted || this.isMapRevealed;
			let isSuppliesRevealed = this.isInSuppliesDetectionRange(sector);
			let isIngredientsRevealed = this.isInIngredientsDetectionRange(sector);
			let level = sector.get(PositionComponent).level;
			
			let hasCampOnLevel = levelEntity.has(CampComponent);
			let hasCampOnSector = sector.has(CampComponent);
			
			let drawSectorShape = function (color, size) {
				ctx.fillStyle = color;
				
				let centerX = sectorXpx + sectorSize / 2;
				let centerY = sectorYpx + sectorSize / 2;
					
				if (hasCampOnSector || sectorPassages.passageUp || sectorPassages.passageDown) {
					let r = size / 2 + 1;
					ctx.beginPath();
					ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
					ctx.fill();
				} else {
					let sizeOffset = size - sectorSize;
					let p = sizeOffset / 2;
					ctx.fillRect(sectorXpx - p, sectorYpx - p, size, size);
				}
			};
			
			let drawSectorBorder = function (color, isAffected, partial) {
				ctx.fillStyle = color;
				let p = isAffected ? 2 : 1;
				if (isBigSectorSize) p *= 2;
				if (partial) {
					ctx.fillRect(sectorXpx  + sectorSize / 2, sectorYpx - p, sectorSize / 2 + p, sectorSize / 2 + p);
					ctx.fillRect(sectorXpx - p, sectorYpx + sectorSize / 2, sectorSize / 2 + p, sectorSize / 2 + p);
				} else {
					drawSectorShape(color, sectorSize + p * 2);
				}
			};

			// border(s) for sectors with hazards or sunlight
			if (SectorConstants.isLBasicInfoVisible(sectorStatus) || this.isMapRevealed || this.isInHazardDetectionRange(sector)) {
				let isLevelSunlit = level == GameGlobals.gameState.getSurfaceLevel();
				let isSectorSunlit = sectorFeatures.sunlit;
				let showBorderForSunlit = !isLevelSunlit || !isLocationSunlit;
				let hasSectorHazard = GameGlobals.sectorHelper.hasHazards(sectorFeatures, statusComponent);
				
				let hasSunlitBorder = isSectorSunlit && showBorderForSunlit;
				let hasHazardBorder = hasSectorHazard;
				
				if (hasHazardBorder) {
					let borderColor = this.getSectorHazardBorderColor(isLocationSunlit, level, sectorFeatures, statusComponent);
					let isAffected = GameGlobals.sectorHelper.isAffectedByHazard(sectorFeatures, statusComponent, itemsComponent);
					drawSectorBorder(borderColor, isAffected, false);
				}
				
				if (hasSunlitBorder) {
					let extraBorderColor = ColorConstants.getColor(isLocationSunlit, "map_stroke_sector_sunlit");
					drawSectorBorder(extraBorderColor, true, hasHazardBorder);
				}
			}
					
			// background color
			let fillColor = this.getSectorFill(sectorStatus);
			drawSectorShape(fillColor, sectorSize);

			// sector contents: points of interest
			var hasIcon = false;
			var iconSize = 10;
			var iconPosYCentered = sectorYpx + sectorSize / 2 - iconSize / 2;
			var iconPosX = sectorXpx + (sectorSize - iconSize) / 2;
			var iconPosY = isBigSectorSize ? sectorYpx : iconPosYCentered;
			var useSunlitImage = isLocationSunlit;
			
			var localesComponent = sector.get(SectorLocalesComponent);
			var unScoutedLocales = localesComponent.locales.length - statusComponent.getNumLocalesScouted();
			var sectorImprovements = sector.get(SectorImprovementsComponent);
			
			let knownItems = GameGlobals.sectorHelper.getLocationKnownItems(sector);
			let knownResources = GameGlobals.sectorHelper.getLocationKnownResources(sector);
			
			let showResourceIcons = isRevealed || isSuppliesRevealed;
			let hasResourcesToShow = knownResources.indexOf(resourceNames.water) >= 0 || knownResources.indexOf(resourceNames.food) >= 0;
			let showResources = showResourceIcons && hasResourcesToShow;
			
			let showIngredientIcons = isRevealed || isIngredientsRevealed;
			let hasIngredientsToShow = knownItems.length > 0;
			let showIngredients = showIngredientIcons && hasIngredientsToShow;

			if (!isRevealed && !this.isMapRevealed && !(showResources || showIngredients)) {
				hasIcon = true;
				ctx.drawImage(this.icons["unknown" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosYCentered);
			} else if (sector.has(WorkshopComponent) && sector.get(WorkshopComponent).isClearable) {
				hasIcon = true;
				ctx.drawImage(this.icons["workshop" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			} else if (sectorImprovements.getCount(improvementNames.greenhouse) > 0) {
				hasIcon = true;
				ctx.drawImage(this.icons["workshop" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			} else if (hasCampOnSector) {
				hasIcon = true;
				ctx.drawImage(this.icons["camp" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			} else if (!hasCampOnLevel && sectorFeatures.canHaveCamp()) {
				hasIcon = true;
				ctx.drawImage(this.icons["campable" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			} else if (unScoutedLocales > 0) {
				hasIcon = true;
				ctx.drawImage(this.icons["interest" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			} else if (sectorPassages.passageUp) {
				hasIcon = true;
				if (GameGlobals.movementHelper.isPassageTypeAvailable(sector, PositionConstants.DIRECTION_UP)) {
					ctx.drawImage(this.icons["passage-up" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
				} else {
					ctx.drawImage(this.icons["passage-up-disabled" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
				}
			} else if (sectorPassages.passageDown) {
				hasIcon = true;
				if (GameGlobals.movementHelper.isPassageTypeAvailable(sector, PositionConstants.DIRECTION_DOWN)) {
					ctx.drawImage(this.icons["passage-down" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
				} else {
					ctx.drawImage(this.icons["passage-down-disabled" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
				}
			} else if (sectorImprovements.getCount(improvementNames.beacon) > 0) {
				hasIcon = true;
				ctx.drawImage(this.icons["beacon" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			} else if (knownItems.length > 0) {
				hasIcon = true;
				ctx.drawImage(this.icons["ingredient" + (useSunlitImage ? "-sunlit" : "")], iconPosX, iconPosY);
			}
	
			// sector contents: resources
			let fitsResourceIcons = isBigSectorSize || !hasIcon;
			if (showResourceIcons && fitsResourceIcons) {
				let directResources = {};
				directResources[resourceNames.water] = sectorImprovements.getCount(improvementNames.collector_water) > 0 || sectorFeatures.hasSpring;
				directResources[resourceNames.food] = sectorImprovements.getCount(improvementNames.collector_food) > 0;
				
				let resourcesCollectable = sectorFeatures.resourcesCollectable;
				this.drawResourcesOnSector(ctx, directResources, resourcesCollectable, knownResources, sectorXpx, sectorYpx, sectorSize);
			}
		},
		
		drawResourcesOnSector: function (ctx, directResources, resourcesCollectable, knownResources, sectorXpx, sectorYpx, sectorSize) {
			let mapResources = [ resourceNames.water, resourceNames.food ];
			
			let totalWidth = 0;
			let bigResSize = 5;
			let smallResSize = 3;
			let padding = 1;
			let isBigSectorSize = sectorSize >= this.getSectorSize(true);
			
			let potentialResources = {};
			
			for (let i in mapResources) {
				var name = mapResources[i];
				var colAmount = resourcesCollectable.getResource(name);
				if (colAmount > 0 || knownResources.indexOf(name) >= 0) {
					potentialResources[name] = true;
				}
				
				if (directResources[name]) totalWidth += bigResSize + padding;
				else if(potentialResources[name]) totalWidth += smallResSize + padding;
			}
			
			if (totalWidth > 0) {
				totalWidth -= padding;
				var x = sectorXpx + sectorSize / 2 - totalWidth / 2;
				var y = isBigSectorSize ? sectorYpx + sectorSize - 5 : sectorYpx + sectorSize / 2 - 1;
				var drawSize = 0;
				var yOffset;
				for (let i in mapResources) {
					var name = mapResources[i];
					if (directResources[name]) {
						drawSize = bigResSize;
						yOffset = -1;
					} else if(potentialResources[name]) {
						drawSize = smallResSize;
						yOffset = 0;
					} else {
						drawSize = 0;
					}
					if (drawSize > 0) {
						ctx.fillStyle = this.getResourceFill(name);
						ctx.fillRect(x, y + yOffset, drawSize, drawSize);
						x = x + drawSize + padding;
					}
				}
			}
		},

		drawMovementLinesOnCanvas: function (ctx, mapPosition, sector, sectorPos, sectorXpx, sectorYpx, sectorSize, sectorPadding) {
			var sunlit = $("body").hasClass("sunlit");
			var sectorPassages = sector.get(PassagesComponent);
			var sectorMiddleX = sectorXpx + sectorSize * 0.5;
			var sectorMiddleY = sectorYpx + sectorSize * 0.5;
			for (let i in PositionConstants.getLevelDirections()) {
				var direction = PositionConstants.getLevelDirections()[i];
				var neighbourPos = PositionConstants.getPositionOnPath(sectorPos, direction, 1);
				var neighbour = GameGlobals.levelHelper.getSectorByPosition(mapPosition.level, neighbourPos.sectorX, neighbourPos.sectorY);
				if (neighbour) {
					var distX = neighbourPos.sectorX - sectorPos.sectorX;
					var distY = neighbourPos.sectorY - sectorPos.sectorY;
					ctx.strokeStyle = ColorConstants.getColor(sunlit, "map_stroke_movementlines");
					ctx.lineWidth = Math.ceil(sectorSize / 6);
					ctx.beginPath();
					ctx.moveTo(sectorMiddleX + 0.5 * sectorSize * distX, sectorMiddleY + 0.5 * sectorSize * distY);
					ctx.lineTo(sectorMiddleX + (0.5 + sectorPadding) * sectorSize * distX, sectorMiddleY + (0.5 + sectorPadding) * sectorSize * distY);

					ctx.stroke();

					var blocker = sectorPassages.getBlocker(direction);
					if (blocker) {
						var blockerType = blocker.type;
						var isBlocked = GameGlobals.movementHelper.isBlocked(sector, direction);
						var isGang = blockerType === MovementConstants.BLOCKER_TYPE_GANG;
						var blockerX = sectorMiddleX + sectorSize * (1 + sectorPadding)/2 * distX;
						var blockerY = sectorMiddleY + sectorSize * (1 + sectorPadding)/2 * distY;
						if (isGang) {
							if (isBlocked) {
								ctx.strokeStyle = ColorConstants.getColor(sunlit, "map_stroke_gang");
								ctx.lineWidth = Math.ceil(sectorSize / 9);
								ctx.beginPath();
								ctx.arc(blockerX, blockerY, sectorSize * 0.2, 0, 2 * Math.PI);
								ctx.stroke();
							}
						} else {
							var crossSize = Math.max(sectorSize / 5, 3);
							ctx.strokeStyle = isBlocked ? ColorConstants.getColor(sunlit, "map_stroke_blocker") : this.getSectorFill(SectorConstants.MAP_SECTOR_STATUS_VISITED_SCOUTED);
							ctx.lineWidth = Math.ceil(sectorSize / 9);
							ctx.beginPath();
							ctx.moveTo(blockerX - crossSize, blockerY - crossSize);
							ctx.lineTo(blockerX + crossSize, blockerY + crossSize);
							ctx.moveTo(blockerX + crossSize, blockerY - crossSize);
							ctx.lineTo(blockerX - crossSize, blockerY + crossSize);
							ctx.stroke();
						}
					}
				}
			}
		},
		
		foreachVisibleSector: function (level, centered, dimensions, visibleSectors, cb) {
			let sectorSize = this.getSectorSize(centered);
			for (let y = dimensions.minVisibleY; y <= dimensions.maxVisibleY; y++) {
				for (let x = dimensions.minVisibleX; x <= dimensions.maxVisibleX; x++) {
					let sector = visibleSectors[x + "." + y];
					let sectorStatus = SectorConstants.getSectorStatus(sector);
					if (this.showSectorOnMap(centered, sector, sectorStatus)) {
						let sectorPos = new PositionVO(level, x, y);
						let sectorXpx = this.getSectorPixelPos(dimensions, centered, sectorSize, x, y).x;
						let sectorYpx = this.getSectorPixelPos(dimensions, centered, sectorSize, x, y).y;
						cb.apply(this, [ sector, sectorPos, sectorStatus, sectorXpx, sectorYpx ]);
					}
				}
			}
		},

		showSectorOnMap: function (centered, sector, sectorStatus) {
			return this.isMapRevealed ? sector : sector && sectorStatus !== SectorConstants.MAP_SECTOR_STATUS_UNVISITED_INVISIBLE;
		},
		
		isInHazardDetectionRange: function (sector) {
			return GameGlobals.sectorHelper.isInDetectionRange(sector, ItemConstants.itemBonusTypes.detect_hazards);
		},
		
		isInSuppliesDetectionRange: function (sector) {
			return GameGlobals.sectorHelper.isInDetectionRange(sector, ItemConstants.itemBonusTypes.detect_supplies);
		},
		
		isInIngredientsDetectionRange: function (sector) {
			return GameGlobals.sectorHelper.isInDetectionRange(sector, ItemConstants.itemBonusTypes.detect_ingredients);
		},

		getCanvasMinimumWidth: function (canvas) {
			switch ($(canvas).attr("id")) {
				case "mainmap": return $(canvas).parent().width();
				case "minimap": return 208;
				default: return 0;
			}
		},

		getCanvasMinimumHeight: function (canvas) {
			switch ($(canvas).attr("id")) {
				case "mainmap": return 10;
				case "minimap": return 208;
				default: return 0;
			}
		},

		getMapSectorDimensions: function (canvasId, mapSize, centered, mapPosition, visibleSectors, allSectors) {
			var level = mapPosition.level;
			var levelComponent = GameGlobals.levelHelper.getLevelEntityForPosition(level).get(LevelComponent);
			var sectorSize = this.getSectorSize(centered);

			var dimensions = {};
			dimensions.mapMinX = levelComponent.minX;
			dimensions.mapMaxX = levelComponent.maxX;
			dimensions.mapMinY = levelComponent.minY;
			dimensions.mapMaxY = levelComponent.maxY;

			dimensions.canvasMinX = levelComponent.minX;
			dimensions.canvasMaxX = levelComponent.maxX;
			dimensions.canvasMinY = levelComponent.minY;
			dimensions.canvasMaxY = levelComponent.maxY;

			if (centered) {
				var levelSize = Math.max(Math.abs(levelComponent.minX - levelComponent.maxX), Math.abs(levelComponent.minY - levelComponent.maxY));
				mapSize = mapSize && mapSize > 0 ? mapSize : levelSize;
				if (mapSize % 2 === 0) mapSize = mapSize + 1;
				var mapDiameter = (mapSize - 1) / 2;
				dimensions.canvasMinX = mapPosition.sectorX - mapDiameter;
				dimensions.canvasMaxX = mapPosition.sectorX + mapDiameter;
				dimensions.canvasMinY = mapPosition.sectorY - mapDiameter;
				dimensions.canvasMaxY = mapPosition.sectorY + mapDiameter;
			}

			var sector;
			var sectorStatus;
			dimensions.minVisibleX = dimensions.mapMaxX + 1;
			dimensions.maxVisibleX = dimensions.mapMinX - 1;
			dimensions.minVisibleY = dimensions.mapMaxY + 1;
			dimensions.maxVisibleY = dimensions.mapMinY - 1;
			for (var y = dimensions.mapMinY; y <= dimensions.mapMaxY; y++) {
				for (var x = dimensions.mapMinX; x <= dimensions.mapMaxX; x++) {
					sector = GameGlobals.levelHelper.getSectorByPosition(mapPosition.level, x, y);
					sectorStatus = SectorConstants.getSectorStatus(sector);
					if (allSectors && sector) allSectors[x + "." + y] = sector;
					// if map is centered, make a node for empty sectors too
					if (centered || this.showSectorOnMap(centered, sector, sectorStatus)) {
						if (visibleSectors) visibleSectors[x + "." + y] = sector;
						dimensions.minVisibleX = Math.min(dimensions.minVisibleX, x);
						dimensions.maxVisibleX = Math.max(dimensions.maxVisibleX, x);
						dimensions.minVisibleY = Math.min(dimensions.minVisibleY, y);
						dimensions.maxVisibleY = Math.max(dimensions.maxVisibleY, y);
					}
				}
			}
			
			// if centered map is on edge, allow visible "sectors" outside of map to be able to center on player
			if (centered) {
				dimensions.minVisibleX = Math.min(dimensions.minVisibleX, dimensions.canvasMinX);
				dimensions.maxVisibleX = Math.max(dimensions.maxVisibleX, dimensions.canvasMaxX);
				dimensions.minVisibleY = Math.min(dimensions.minVisibleY, dimensions.canvasMinY);
				dimensions.maxVisibleY = Math.max(dimensions.maxVisibleY, dimensions.canvasMaxY);
			}
			
			dimensions.minVisibleX = Math.max(dimensions.minVisibleX, dimensions.canvasMinX);
			dimensions.maxVisibleX = Math.min(dimensions.maxVisibleX, dimensions.canvasMaxX);
			dimensions.minVisibleY = Math.max(dimensions.minVisibleY, dimensions.canvasMinY);
			dimensions.maxVisibleY = Math.min(dimensions.maxVisibleY, dimensions.canvasMaxY);

			var canvas = $("#" + canvasId);
			dimensions.mapWidth = (dimensions.maxVisibleX - dimensions.minVisibleX + (centered ? 1.5 : 1.5)) * sectorSize * (1 + this.getSectorPadding(centered)) + sectorSize * this.getSectorMargin(centered) * 2;
			dimensions.mapHeight = (dimensions.maxVisibleY - dimensions.minVisibleY + (centered ? 1.5 : 1.5)) * sectorSize * (1 + this.getSectorPadding(centered)) + sectorSize * this.getSectorMargin(centered) * 2;
			dimensions.canvasWidth = Math.max(dimensions.mapWidth, this.getCanvasMinimumWidth(canvas));
			dimensions.canvasHeight = Math.max(dimensions.mapHeight, this.getCanvasMinimumHeight(canvas));
			dimensions.sectorSize = sectorSize;
			
			return dimensions;
		},
		
		getBackgroundColor: function (level, sunlit) {
			let isLevelSunlit = level == GameGlobals.gameState.getSurfaceLevel();
			if (isLevelSunlit) {
				return ColorConstants.getColor(sunlit, "map_background_surface");
			} else {
				return ColorConstants.getColor(sunlit, "map_background_default");
			}
		},
		
		getVisibleAreaBackgroundColor: function (level, sunlit) {
			let isLevelSunlit = level == GameGlobals.gameState.getSurfaceLevel();
			let isGround = level == GameGlobals.gameState.getGroundLevel();
			if (isLevelSunlit) {
				return ColorConstants.getColor(sunlit, "map_background_2_surface");
			} else if (isGround) {
				return ColorConstants.getColor(sunlit, "map_background_2_ground");
			} else {
				return ColorConstants.getColor(sunlit, "map_background_2_default");
			}
		},

		getSectorSize: function (centered) {
			return MapUtils.getSectorSize(centered ? MapUtils.MAP_ZOOM_MINIMAP : MapUtils.MAP_ZOOM_DEFAULT);
		},

		getGridSize: function () {
			return MapUtils.getGridSize();
		},

		getSectorPadding: function (centered) {
			return MapUtils.getSectorPadding(centered ? MapUtils.MAP_ZOOM_MINIMAP : MapUtils.MAP_ZOOM_DEFAULT);
		},
		
		getSectorMargin: function (centered) {
			return MapUtils.getSectorMargin(centered ? MapUtils.MAP_ZOOM_MINIMAP : MapUtils.MAP_ZOOM_DEFAULT);
		},

		getSectorFill: function (sectorStatus) {
			var sunlit = $("body").hasClass("sunlit");
			switch (sectorStatus) {
				case SectorConstants.MAP_SECTOR_STATUS_UNVISITED_INVISIBLE:
				case SectorConstants.MAP_SECTOR_STATUS_UNVISITED_VISIBLE:
					return ColorConstants.getColor(sunlit, "map_fill_sector_unvisited");

				case SectorConstants.MAP_SECTOR_STATUS_VISITED_UNSCOUTED:
				case SectorConstants.MAP_SECTOR_STATUS_REVEALED_BY_MAP:
					return ColorConstants.getColor(sunlit, "map_fill_sector_unscouted");

				case SectorConstants.MAP_SECTOR_STATUS_VISITED_SCOUTED:
					return ColorConstants.getColor(sunlit, "map_fill_sector_scouted");

				case SectorConstants.MAP_SECTOR_STATUS_VISITED_CLEARED:
					return ColorConstants.getColor(sunlit, "map_fill_sector_cleared");
			}
		},
		
		getSectorHazardBorderColor: function (sunlit, level, sectorFeatures, sectorStatus) {
			let hasSectorHazard = GameGlobals.sectorHelper.hasHazards(sectorFeatures, sectorStatus);
			
			if (hasSectorHazard) {
				let hazards = GameGlobals.sectorHelper.getEffectiveHazards(sectorFeatures, sectorStatus);
				let mainHazard = hazards.getMainHazard();
				if (mainHazard == "cold") {
					return ColorConstants.getColor(sunlit, "map_stroke_sector_cold");
				} else if (mainHazard == "debris") {
					return ColorConstants.getColor(sunlit, "map_stroke_sector_debris");
				} else {
					return ColorConstants.getColor(sunlit, "map_stroke_sector_hazard");
				}
			}
			
			return ColorConstants.getColor(sunlit, "map_stroke_sector");
		},

		getResourceFill: function (resourceName) {
			switch (resourceName) {
				case resourceNames.metal: return ColorConstants.getGlobalColor("res_metal");
				case resourceNames.water: return ColorConstants.getGlobalColor("res_water");
				case resourceNames.food: return ColorConstants.getGlobalColor("res_food");
				case resourceNames.fuel: return ColorConstants.getGlobalColor("res_fuel");
				case resourceNames.rubber: return ColorConstants.getGlobalColor("res_rubber");
			}
		},

	});

	return UIMapHelper;
});
